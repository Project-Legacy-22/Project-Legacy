import { afterEach, describe, expect, it } from 'vitest';

import { makeIdentifyCaller, makeSignIn } from '@legacy/core-auth';
import { makeInviteProjectMember, makeListInvitations, makeRespondToInvitation } from '@legacy/core-projects';
import { InvitationOutcomeDto, PendingInvitationListDto, ProblemDetails } from '@legacy/contracts';

import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryInvitationRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-invitation-repository.js';
import type { InMemoryInvitationRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-invitation-repository.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';

const PROJECT = '0191f3c2-1111-7000-8000-aaaaaaaaaaaa';
const OWNER = '0191f3c2-aaaa-7000-8000-000000000001';
const MEMBER = '0191f3c2-aaaa-7000-8000-000000000002';
const GUEST = '0191f3c2-aaaa-7000-8000-000000000003';
const ACCOUNTS = [
    { id: OWNER, email: 'owner@example.com' },
    { id: MEMBER, email: 'member@example.com' },
    { id: GUEST, email: 'guest@example.com' },
];
const PASSWORD = 'Invitations2026';

let harness: Harness | undefined;
let nextId = 0;

function repositoryOf(): InMemoryInvitationRepository {
    return inMemoryInvitationRepository(ACCOUNTS, [
        { projectId: PROJECT, projectName: 'Launch', userId: OWNER, role: 'owner' },
        { projectId: PROJECT, projectName: 'Launch', userId: MEMBER, role: 'member' },
    ]);
}

async function serve(callerId: string | null, repository: InMemoryInvitationRepository): Promise<Harness> {
    const provider = inMemoryIdentityProvider(ACCOUNTS.map(account => ({ ...account, password: PASSWORD })));
    const caller = ACCOUNTS.find(account => account.id === callerId);
    const cookie = caller === undefined ? undefined
        : `${SESSION_COOKIE}=${(await makeSignIn(provider)(caller.email, PASSWORD)).accessToken}`;
    const logger = recordingLogger();
    const useCases = makeAppUseCases({
        auth: { identifyCaller: makeIdentifyCaller(provider) },
        projects: {
            inviteProjectMember: makeInviteProjectMember({
                repository,
                newId: () => `0191f3c2-bbbb-7000-8000-${String(++nextId).padStart(12, '0')}`,
                now: () => new Date('2026-09-24T09:00:00.000Z'),
            }),
            listInvitations: makeListInvitations(repository),
            respondToInvitation: makeRespondToInvitation(repository),
        },
    });
    harness = await listen(createServer(testConfig, useCases, { logger }), logger, cookie);
    return harness;
}

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

const invite = (api: Harness, email: string) =>
    api.request(`/projects/${PROJECT}/invitations`, json('POST', { email }));

describe('POST /projects/:projectId/invitations', () => {
    it('invites with 201, then answers 200 without inviting twice', async () => {
        const repository = repositoryOf();
        const api = await serve(OWNER, repository);

        const first = await invite(api, ' Guest@Example.com ');
        const second = await invite(api, 'guest@example.com');

        expect(first.status).toBe(201);
        expect(InvitationOutcomeDto.parse(await first.json())).toEqual({ outcome: 'invited' });
        expect(second.status).toBe(200);
        expect(InvitationOutcomeDto.parse(await second.json())).toEqual({ outcome: 'already_invited' });
        expect(repository.events).toHaveLength(1);
        expect(JSON.stringify(api.logger.lines)).not.toContain('guest@example.com');
    });

    it('refuses a member who does not own the project with 403', async () => {
        const api = await serve(MEMBER, repositoryOf());

        const response = await invite(api, 'guest@example.com');

        expect(response.status).toBe(403);
        expect(ProblemDetails.parse(await response.json()).type).toBe('not_project_owner');
    });

    it('names an address no account carries, with 404', async () => {
        const api = await serve(OWNER, repositoryOf());

        const response = await invite(api, 'nobody@example.com');

        expect(response.status).toBe(404);
        // Shown as is by the interface, so it is written for the owner.
        expect(ProblemDetails.parse(await response.json())).toMatchObject({
            type: 'account_not_found',
            detail: 'No account uses this email address. Check it for a typo.',
        });
    });

    it('refuses a body that is not an address, with 400', async () => {
        const api = await serve(OWNER, repositoryOf());

        const response = await invite(api, 'not an address');

        expect(response.status).toBe(400);
    });

    it('requires a session', async () => {
        const api = await serve(null, repositoryOf());

        expect((await invite(api, 'guest@example.com')).status).toBe(401);
    });
});

describe('the invited person answers', () => {
    async function invitedAs(callerId: string) {
        const repository = repositoryOf();
        const owner = await serve(OWNER, repository);
        await invite(owner, 'guest@example.com');
        await owner.close();
        harness = undefined;
        const api = await serve(callerId, repository);
        return { repository, api };
    }

    it('lists the invitation with the project and who sent it', async () => {
        const { api } = await invitedAs(GUEST);

        const response = await api.request('/projects/invitations');
        const list = PendingInvitationListDto.parse(await response.json());

        expect(list.invitations).toEqual([
            expect.objectContaining({ projectId: PROJECT, projectName: 'Launch', invitedByEmail: 'owner@example.com' }),
        ]);
    });

    it('joins the project on accept, with an empty 204, and cannot answer twice', async () => {
        const { api, repository } = await invitedAs(GUEST);
        const id = repository.invitations[0]?.id ?? '';

        const accepted = await api.request(`/projects/invitations/${id}/accept`, { method: 'POST' });
        const again = await api.request(`/projects/invitations/${id}/decline`, { method: 'POST' });

        expect(accepted.status).toBe(204);
        expect(await accepted.text()).toBe('');
        expect(repository.members).toContainEqual(expect.objectContaining({ userId: GUEST, role: 'member' }));
        expect(again.status).toBe(409);
    });

    it('answers another account as if the invitation did not exist', async () => {
        const { api, repository } = await invitedAs(MEMBER);
        const id = repository.invitations[0]?.id ?? '';

        const response = await api.request(`/projects/invitations/${id}/accept`, { method: 'POST' });

        expect(response.status).toBe(404);
        expect(repository.members.filter(member => member.userId === GUEST)).toEqual([]);
    });

    it('refuses an identifier that is not a UUID with 400', async () => {
        const { api } = await invitedAs(GUEST);

        expect((await api.request('/projects/invitations/42/accept', { method: 'POST' })).status).toBe(400);
    });
});
