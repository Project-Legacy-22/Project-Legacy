import { afterEach, describe, expect, it } from 'vitest';

import { makeIdentifyCaller, makeSignIn } from '@legacy/core-auth';
import { makeListProjectMembers, makeRemoveProjectMember } from '@legacy/core-projects';
import type { MemberRemovalRepository } from '@legacy/core-projects';
import { ProblemDetails } from '@legacy/contracts';

import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { MEMBER, OTHER_PROJECT, OWNER, PROJECT, sharedMemberships, STRANGER } from '../../../../../packages/core/projects/test/builders/memberships.js';
import { inMemoryMembershipRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-membership-repository.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';

const PATH = `/projects/${PROJECT}/members/${MEMBER}`;
let harness: Harness | undefined;

async function serve(
    callerId: string | null = OWNER,
    repository: MemberRemovalRepository = inMemoryMembershipRepository(sharedMemberships()),
): Promise<Harness> {
    const email = 'caller@example.com';
    const password = 'MemberRemoval2026';
    const provider = inMemoryIdentityProvider([
        { id: callerId ?? OWNER, email, password },
    ]);
    const cookie = callerId === null ? undefined
        : `${SESSION_COOKIE}=${(await makeSignIn(provider)(email, password)).accessToken}`;
    const logger = recordingLogger();
    const useCases = makeAppUseCases({
        auth: { identifyCaller: makeIdentifyCaller(provider) },
        projects: {
            listProjectMembers: makeListProjectMembers(repository),
            removeProjectMember: makeRemoveProjectMember(repository),
        },
    });
    harness = await listen(createServer(testConfig, useCases, { logger }), logger, cookie);
    return harness;
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe('DELETE /projects/:projectId/members/:userId', () => {
    it('returns an empty 204 and removes the member from the subsequent list', async () => {
        const api = await serve();

        const response = await api.request(PATH, { method: 'DELETE' });

        expect(response.status).toBe(204);
        expect(await response.text()).toBe('');
        const list = await api.request(`/projects/${PROJECT}/members`);
        expect(await list.json()).toEqual({
            members: [{ userId: OWNER, email: 'owner@example.com', role: 'owner' }],
        });
        expect(JSON.stringify(api.logger.lines)).not.toContain('owner@example.com');
        expect(JSON.stringify(api.logger.lines)).not.toContain('member@example.com');
    });

    it('requires an authenticated session', async () => {
        const api = await serve(null);

        const response = await api.request(PATH, { method: 'DELETE' });

        expect(response.status).toBe(401);
    });

    it.each([MEMBER, OWNER])('refuses a non-owner removing %s', async memberId => {
        const repository = inMemoryMembershipRepository(sharedMemberships());
        const api = await serve(MEMBER, repository);

        const response = await api.request(`/projects/${PROJECT}/members/${memberId}`, { method: 'DELETE' });

        expect(response.status).toBe(403);
        expect(ProblemDetails.parse(await response.json()).type).toBe('project_owner_required');
        expect(await repository.membersOf(PROJECT)).toHaveLength(2);
    });

    it('never takes the caller identity from a forged request body', async () => {
        const api = await serve(MEMBER);

        const response = await api.request(PATH, json('DELETE', { callerId: OWNER }));

        expect(response.status).toBe(403);
    });

    it.each([PROJECT, STRANGER])('answers an outsider with the same missing-project error for %s', async projectId => {
        const api = await serve(STRANGER);

        const response = await api.request(`/projects/${projectId}/members/${MEMBER}`, { method: 'DELETE' });

        expect(response.status).toBe(404);
        const problem = ProblemDetails.parse(await response.json());
        expect(problem).toMatchObject({
            type: 'project_not_found',
            title: 'ProjectNotFound',
            detail: `Project ${projectId} not found`,
            status: 404,
        });
    });

    it('refuses the last owner without changing the membership list', async () => {
        const repository = inMemoryMembershipRepository(sharedMemberships());
        const api = await serve(OWNER, repository);

        const response = await api.request(`/projects/${PROJECT}/members/${OWNER}`, { method: 'DELETE' });

        expect(response.status).toBe(409);
        expect(ProblemDetails.parse(await response.json()).type).toBe('last_project_owner');
        expect(await repository.membersOf(PROJECT)).toHaveLength(2);
    });

    it('returns 404 for an absent membership and for a repeated removal', async () => {
        const api = await serve();
        await api.request(PATH, { method: 'DELETE' });

        const repeated = await api.request(PATH, { method: 'DELETE' });
        const absent = await api.request(`/projects/${PROJECT}/members/${STRANGER}`, { method: 'DELETE' });

        expect(repeated.status).toBe(404);
        expect(absent.status).toBe(404);
        expect(ProblemDetails.parse(await repeated.json()).type).toBe('project_member_not_found');
        expect(ProblemDetails.parse(await absent.json()).type).toBe('project_member_not_found');
    });

    it('does not let ownership of one project remove a member of another', async () => {
        const repository = inMemoryMembershipRepository(sharedMemberships());
        const api = await serve(OWNER, repository);

        const response = await api.request(`/projects/${OTHER_PROJECT}/members/${MEMBER}`, { method: 'DELETE' });

        expect(response.status).toBe(404);
        expect(await repository.membersOf(OTHER_PROJECT)).toHaveLength(1);
    });

    it.each([
        '/projects/not-a-uuid/members/' + MEMBER,
        `/projects/${PROJECT}/members/not-a-uuid`,
    ])('validates both resource identifiers: %s', async path => {
        const api = await serve();

        const response = await api.request(path, { method: 'DELETE' });

        expect(response.status).toBe(400);
        expect(ProblemDetails.parse(await response.json()).type).toBe('validation_error');
    });

    it('reports a technical failure without exposing it to the caller', async () => {
        const repository = inMemoryMembershipRepository(sharedMemberships());
        const api = await serve(OWNER, {
            ...repository,
            removeMember: () => Promise.reject(new Error('private SQL failure')),
        });

        const response = await api.request(PATH, { method: 'DELETE' });

        expect(response.status).toBe(500);
        const problem = ProblemDetails.parse(await response.json());
        expect(problem.type).toBe('internal_error');
        expect(problem.detail).not.toContain('SQL');
        expect(await repository.membersOf(PROJECT)).toHaveLength(2);
    });
});
