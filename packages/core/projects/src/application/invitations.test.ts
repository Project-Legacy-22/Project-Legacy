import { describe, expect, it } from 'vitest';

import { inMemoryInvitationRepository } from '../../test/fakes/in-memory-invitation-repository.js';
import { INVITATION_CREATED_V1 } from '../domain/event.js';
import { AccountNotFound, InvitationAlreadyAnswered, InvitationNotFound, NotProjectOwner } from '../domain/invitation.js';
import { ProjectNotFound } from '../domain/project.js';
import { makeInviteProjectMember } from './invite-project-member.js';
import { makeListInvitations } from './list-invitations.js';
import { makeRespondToInvitation } from './respond-to-invitation.js';

const PROJECT = '0191f3c2-1111-7000-8000-aaaaaaaaaaaa';
const OWNER = '0191f3c2-aaaa-7000-8000-000000000001';
const MEMBER = '0191f3c2-aaaa-7000-8000-000000000002';
const GUEST = '0191f3c2-aaaa-7000-8000-000000000003';
const STRANGER = '0191f3c2-aaaa-7000-8000-000000000004';
const NOW = new Date('2026-09-24T09:00:00.000Z');

const ACCOUNTS = [
    { id: OWNER, email: 'owner@example.com' },
    { id: MEMBER, email: 'member@example.com' },
    { id: GUEST, email: 'guest@example.com' },
    { id: STRANGER, email: 'stranger@example.com' },
];

function setup() {
    const repository = inMemoryInvitationRepository(ACCOUNTS, [
        { projectId: PROJECT, projectName: 'Launch', userId: OWNER, role: 'owner' },
        { projectId: PROJECT, projectName: 'Launch', userId: MEMBER, role: 'member' },
    ]);
    let next = 0;
    const newId = () => `0191f3c2-bbbb-7000-8000-${String(++next).padStart(12, '0')}`;
    return {
        repository,
        invite: makeInviteProjectMember({ repository, newId, now: () => NOW }),
        list: makeListInvitations(repository),
        respond: makeRespondToInvitation(repository),
    };
}

describe('inviting someone into a project', () => {
    it('lets the owner invite an account, and announces it with identifiers only', async () => {
        const { repository, invite } = setup();

        await expect(invite({ projectId: PROJECT, actorId: OWNER, email: 'guest@example.com' })).resolves.toBe('invited');

        expect(repository.events).toEqual([
            {
                id: repository.events[0]?.id,
                name: INVITATION_CREATED_V1,
                occurredAt: NOW.toISOString(),
                payload: { invitationId: repository.invitations[0]?.id, projectId: PROJECT, inviteeId: GUEST, invitedBy: OWNER },
            },
        ]);
    });

    it('refuses a member who does not own the project with 403', async () => {
        const { invite } = setup();

        await expect(invite({ projectId: PROJECT, actorId: MEMBER, email: 'guest@example.com' })).rejects.toBeInstanceOf(NotProjectOwner);
    });

    it('answers a stranger as if the project did not exist', async () => {
        const { invite } = setup();

        await expect(invite({ projectId: PROJECT, actorId: STRANGER, email: 'guest@example.com' })).rejects.toBeInstanceOf(ProjectNotFound);
    });

    it('says when no account carries the address, so a typo can be corrected', async () => {
        const { invite } = setup();

        await expect(invite({ projectId: PROJECT, actorId: OWNER, email: 'nobody@example.com' })).rejects.toBeInstanceOf(AccountNotFound);
    });

    it('invites a person once, and announces it once', async () => {
        const { repository, invite } = setup();

        await invite({ projectId: PROJECT, actorId: OWNER, email: 'guest@example.com' });
        await expect(invite({ projectId: PROJECT, actorId: OWNER, email: 'guest@example.com' })).resolves.toBe('already_invited');

        expect(repository.events).toHaveLength(1);
    });

    it('does not invite someone already in the project, the owner included', async () => {
        const { repository, invite } = setup();

        await expect(invite({ projectId: PROJECT, actorId: OWNER, email: 'member@example.com' })).resolves.toBe('already_member');
        await expect(invite({ projectId: PROJECT, actorId: OWNER, email: 'owner@example.com' })).resolves.toBe('already_member');
        expect(repository.events).toHaveLength(0);
    });
});

describe('answering an invitation', () => {
    async function invited() {
        const context = setup();
        await context.invite({ projectId: PROJECT, actorId: OWNER, email: 'guest@example.com' });
        const [pending] = await context.list(GUEST);
        if (pending === undefined) throw new Error('the invitation should be pending');
        return { ...context, pending };
    }

    it('shows the person invited who invites them, and into what', async () => {
        const { pending } = await invited();

        expect(pending).toMatchObject({ projectId: PROJECT, projectName: 'Launch', invitedByEmail: 'owner@example.com' });
    });

    it('adds the person as a member when they accept', async () => {
        const { repository, respond, list, pending } = await invited();

        await expect(respond({ invitationId: pending.id, inviteeId: GUEST, accept: true })).resolves.toBe('accepted');

        expect(repository.members).toContainEqual(expect.objectContaining({ projectId: PROJECT, userId: GUEST, role: 'member' }));
        await expect(list(GUEST)).resolves.toEqual([]);
    });

    it('adds no one when they decline', async () => {
        const { repository, respond, pending } = await invited();

        await expect(respond({ invitationId: pending.id, inviteeId: GUEST, accept: false })).resolves.toBe('declined');

        expect(repository.members.some(member => member.userId === GUEST)).toBe(false);
    });

    it('lets no one else answer: the invitation does not exist for them', async () => {
        const { respond, pending } = await invited();

        await expect(respond({ invitationId: pending.id, inviteeId: STRANGER, accept: true })).rejects.toBeInstanceOf(InvitationNotFound);
    });

    it('refuses a second answer with 409', async () => {
        const { respond, pending } = await invited();

        await respond({ invitationId: pending.id, inviteeId: GUEST, accept: false });

        await expect(respond({ invitationId: pending.id, inviteeId: GUEST, accept: true })).rejects.toBeInstanceOf(InvitationAlreadyAnswered);
    });
});
