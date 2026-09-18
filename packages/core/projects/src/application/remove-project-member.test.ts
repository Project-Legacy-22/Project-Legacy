import { describe, expect, it } from 'vitest';

import { aMembership, MEMBER, OTHER_PROJECT, OWNER, PROJECT, sharedMemberships, STRANGER } from '../../test/builders/memberships.js';
import { inMemoryMembershipRepository } from '../../test/fakes/in-memory-membership-repository.js';
import { LastProjectOwner, ProjectMemberNotFound, ProjectOwnerRequired } from '../domain/member-removal.js';
import { ProjectNotFound } from '../domain/project.js';
import { makeRemoveProjectMember } from './remove-project-member.js';

const removal = { projectId: PROJECT, callerId: OWNER, memberId: MEMBER };

describe('removing a project member', () => {
    it('removes only the targeted membership, keeping the same account in other projects', async () => {
        const repository = inMemoryMembershipRepository(sharedMemberships());

        await makeRemoveProjectMember(repository)(removal);

        expect(await repository.membersOf(PROJECT)).toEqual([
            { userId: OWNER, email: 'owner@example.com', role: 'owner' },
        ]);
        expect(await repository.membersOf(OTHER_PROJECT)).toEqual([
            { userId: MEMBER, email: 'member@example.com', role: 'owner' },
        ]);
    });

    it.each([
        { callerId: MEMBER, memberId: OWNER, error: ProjectOwnerRequired },
        { callerId: MEMBER, memberId: MEMBER, error: ProjectOwnerRequired },
        { callerId: STRANGER, memberId: MEMBER, error: ProjectNotFound },
        { callerId: OWNER, memberId: STRANGER, error: ProjectMemberNotFound },
        { callerId: OWNER, memberId: OWNER, error: LastProjectOwner },
    ])('refuses $callerId removing $memberId without changing memberships', async ({ error, ...ids }) => {
        const repository = inMemoryMembershipRepository(sharedMemberships());
        const before = await repository.membersOf(PROJECT);

        await expect(makeRemoveProjectMember(repository)({ ...removal, ...ids })).rejects.toThrow(error);

        expect(await repository.membersOf(PROJECT)).toEqual(before);
    });

    it('treats an absent project like a project the caller cannot access', async () => {
        const repository = inMemoryMembershipRepository();

        await expect(makeRemoveProjectMember(repository)(removal)).rejects.toThrow(ProjectNotFound);
    });

    it.each([OWNER, MEMBER])('allows removing owner %s when another owner remains', async memberId => {
        const repository = inMemoryMembershipRepository([
            aMembership(),
            aMembership({ userId: MEMBER }),
        ]);

        await makeRemoveProjectMember(repository)({ ...removal, memberId });

        const remaining = await repository.membersOf(PROJECT);
        expect(remaining).toHaveLength(1);
        expect(remaining[0]).toMatchObject({ role: 'owner' });
        expect(remaining[0]?.userId).not.toBe(memberId);
    });

    it('does not remove anything else when the same request is retried', async () => {
        const repository = inMemoryMembershipRepository(sharedMemberships());
        const remove = makeRemoveProjectMember(repository);
        await remove(removal);
        const before = await repository.membersOf(PROJECT);

        await expect(remove(removal)).rejects.toThrow(ProjectMemberNotFound);

        expect(await repository.membersOf(PROJECT)).toEqual(before);
    });

    it.each([new ProjectNotFound(PROJECT), new ProjectOwnerRequired(), new LastProjectOwner()])(
        'preserves a transactional refusal after the initial authorization read: %s',
        async error => {
            const repository = inMemoryMembershipRepository(sharedMemberships());
            const before = await repository.membersOf(PROJECT);
            const remove = makeRemoveProjectMember({
                ...repository,
                removeMember: () => Promise.reject(error),
            });

            await expect(remove(removal)).rejects.toBe(error);

            expect(await repository.membersOf(PROJECT)).toEqual(before);
        },
    );

    it('reports a persistence failure instead of pretending the membership was removed', async () => {
        const repository = inMemoryMembershipRepository(sharedMemberships());
        const failure = new Error('database unavailable');
        const remove = makeRemoveProjectMember({
            ...repository,
            removeMember: () => Promise.reject(failure),
        });

        await expect(remove(removal)).rejects.toBe(failure);

        expect(await repository.membersOf(PROJECT)).toHaveLength(2);
    });
});
