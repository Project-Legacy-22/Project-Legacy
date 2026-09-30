import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
} from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
import {
    makeAddProject,
    makeListProjectMembers,
    makeListProjects,
    makeRemoveProject,
    makeRenameProject,
} from '@legacy/core-projects';
import type { Project } from '@legacy/core-projects';

import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';
import { inMemoryItemRepository } from '../../../../../packages/core/items/test/fakes/in-memory-item-repository.js';
import { inMemoryMembershipRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-membership-repository.js';
import { inMemoryProjectRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-project-repository.js';
import type {
    InMemoryProjectRepository,
    ProjectMembership,
} from '../../../../../packages/core/projects/test/fakes/in-memory-project-repository.js';
import { ProjectDto, ProjectMemberListDto } from '@legacy/contracts';

import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_ACCOUNT_ID = '00000000-0000-7000-8000-000000000002';
const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const OTHER_PROJECT_ID = '00000000-0000-7000-8000-000000000020';
const UNKNOWN_PROJECT_ID = '00000000-0000-7000-8000-000000000099';
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const AUTRE_ADRESSE = 'bob@example.com';

// The shared project of these cases: the session holder, as owner, and a second member.
// OTHER_PROJECT_ID only belongs to the other account, which gives the case of an existing project
// one is not a member of.
const APPARTENANCES = [
    { projectId: PROJECT_ID, userId: ACCOUNT_ID, email: ADRESSE, role: 'owner' as const },
    { projectId: PROJECT_ID, userId: OTHER_ACCOUNT_ID, email: AUTRE_ADRESSE, role: 'member' as const },
    { projectId: OTHER_PROJECT_ID, userId: OTHER_ACCOUNT_ID, email: AUTRE_ADRESSE, role: 'owner' as const },
];

function useCasesOver(
    projects: InMemoryProjectRepository,
    provider: ReturnType<typeof inMemoryIdentityProvider>,
): AppUseCases {
    const items = inMemoryItemRepository();
    const personalData = inMemoryPersonalDataStore();
    return makeAppUseCases({
        notifications: {
            countUnread: () => Promise.resolve(0),
        },
        projects: {
            listProjects: makeListProjects(projects),
            addProject: makeAddProject({
                repository: projects,
                newId: () => PROJECT_ID,
            }),
            removeProject: makeRemoveProject(projects),
            renameProject: makeRenameProject(projects),
            listProjectMembers: makeListProjectMembers(
                inMemoryMembershipRepository(APPARTENANCES),
            ),
        },
        items: {
            listItems: makeListItems(items),
            addItem: makeAddItem({
                repository: items,
                newId: () => PROJECT_ID,
                now: () => new Date('2026-09-08T10:00:00.000Z'),
            }),
            changeItem: makeChangeItem(items),
            removeItem: makeRemoveItem(items),
        },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(),
            }),
        },
        account: {
            exportPersonalData: makeExportPersonalData({
                store: personalData,
                now: () => new Date('2026-09-08T10:00:00.000Z'),
            }),
            eraseAccount: makeEraseAccount({
                store: personalData,
                identity: provider,
            }),
        },
    });
}

describe('projects API', () => {
    let harness: Harness;
    let repository: InMemoryProjectRepository;

    async function serve(projects: Project[] = [], memberships: ProjectMembership[] = []): Promise<void> {
        repository = inMemoryProjectRepository(projects, memberships);
        const provider = inMemoryIdentityProvider([{ id: ACCOUNT_ID, email: ADRESSE, password: MOT_DE_PASSE }]);
        const session = await makeSignIn(provider)(ADRESSE, MOT_DE_PASSE);
        const logger = recordingLogger();
        harness = await listen(
            createServer(testConfig, useCasesOver(repository, provider), { logger: logger }),
            logger,
            `${SESSION_COOKIE}=${session.accessToken}`,
        );
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    it('lists only projects where the caller is a member', async () => {
        await harness.close();
        const mine = {
            id: PROJECT_ID,
            name: 'Mine',
            role: 'owner' as const,
            itemCount: 3,
        };
        const theirs = {
            id: OTHER_PROJECT_ID,
            name: 'Theirs',
            role: 'owner' as const,
            itemCount: 1,
        };
        await serve(
            [mine, theirs],
            [
                { projectId: PROJECT_ID, userId: ACCOUNT_ID, role: 'owner' },
                {
                    projectId: OTHER_PROJECT_ID,
                    userId: OTHER_ACCOUNT_ID,
                    role: 'owner',
                },
            ],
        );

        const response = await harness.request('/projects');

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            projects: [mine],
            nextCursor: null,
        });
    });

    it('paginates the visible project list', async () => {
        await harness.close();
        const first = {
            id: PROJECT_ID,
            name: 'First',
            role: 'owner' as const,
            itemCount: 0,
        };
        const second = {
            id: OTHER_PROJECT_ID,
            name: 'Second',
            role: 'member' as const,
            itemCount: 2,
        };
        await serve(
            [first, second],
            [
                { projectId: PROJECT_ID, userId: ACCOUNT_ID, role: 'owner' },
                { projectId: OTHER_PROJECT_ID, userId: ACCOUNT_ID, role: 'member' },
            ],
        );

        const firstPage = (await (await harness.request('/projects?limit=1')).json()) as {
            projects: Project[];
            nextCursor: string;
        };
        const secondPage = await harness.request(
            `/projects?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`,
        );

        expect(firstPage.projects).toEqual([{ ...second, role: 'member' }]);
        await expect(secondPage.json()).resolves.toEqual({
            projects: [first],
            nextCursor: null,
        });
    });

    it('creates a project and its owner membership', async () => {
        const response = await harness.request('/projects', json('POST', { name: 'Roadmap' }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            id: PROJECT_ID,
            name: 'Roadmap',
            role: 'owner',
            itemCount: 0,
        });
        expect(repository.memberships).toContainEqual({
            projectId: PROJECT_ID,
            userId: ACCOUNT_ID,
            role: 'owner',
        });
    });

    it('rejects an empty project name', async () => {
        const response = await harness.request('/projects', json('POST', { name: '   ' }));

        expect(response.status).toBe(400);
        expect(repository.projects.size).toBe(0);
    });

    it('deletes a project only for its owner and hides its existence otherwise', async () => {
        await harness.close();
        const project = {
            id: PROJECT_ID,
            name: 'Mine',
            role: 'member' as const,
            itemCount: 2,
        };
        await serve(
            [project],
            [
                { projectId: PROJECT_ID, userId: ACCOUNT_ID, role: 'member' },
                { projectId: PROJECT_ID, userId: OTHER_ACCOUNT_ID, role: 'owner' },
            ],
        );

        const denied = await harness.request(`/projects/${PROJECT_ID}`, {
            method: 'DELETE',
        });
        const unknown = await harness.request(`/projects/${UNKNOWN_PROJECT_ID}`, {
            method: 'DELETE',
        });

        expect(denied.status).toBe(404);
        expect(unknown.status).toBe(404);
        expect(repository.projects.has(PROJECT_ID)).toBe(true);
    });

    describe('PATCH /projects/:projectId', () => {
        const OWNED = { id: PROJECT_ID, name: 'Mine', role: 'owner' as const, itemCount: 3 };

        beforeEach(async () => {
            await harness.close();
            await serve(
                [OWNED, { id: OTHER_PROJECT_ID, name: 'Theirs', role: 'owner', itemCount: 0 }],
                [
                    { projectId: PROJECT_ID, userId: ACCOUNT_ID, role: 'owner' },
                    { projectId: OTHER_PROJECT_ID, userId: ACCOUNT_ID, role: 'member' },
                    { projectId: OTHER_PROJECT_ID, userId: OTHER_ACCOUNT_ID, role: 'owner' },
                ],
            );
        });

        it('renames a project the caller owns and returns it in the contract shape', async () => {
            const response = await harness.request(`/projects/${PROJECT_ID}`, json('PATCH', { name: ' Roadmap ' }));

            const body: unknown = await response.json();
            expect([response.status, ProjectDto.safeParse(body).success]).toEqual([200, true]);
            expect(body).toEqual({ ...OWNED, name: 'Roadmap' });
            expect(repository.projects.get(PROJECT_ID)?.name).toBe('Roadmap');
        });

        it('answers a member who does not own the project like an unknown project', async () => {
            const denied = await harness.request(`/projects/${OTHER_PROJECT_ID}`, json('PATCH', { name: 'Taken' }));
            const unknown = await harness.request(`/projects/${UNKNOWN_PROJECT_ID}`, json('PATCH', { name: 'Taken' }));

            expect([denied.status, unknown.status]).toEqual([404, 404]);
            expect(repository.projects.get(OTHER_PROJECT_ID)?.name).toBe('Theirs');
        });

        it.each([
            ['an empty name', { name: '   ' }],
            ['a name over the limit', { name: 'x'.repeat(256) }],
            ['a missing name', {}],
        ])('rejects %s and keeps the project unchanged', async (_case, body) => {
            const response = await harness.request(`/projects/${PROJECT_ID}`, json('PATCH', body));

            expect(response.status).toBe(400);
            expect(repository.projects.get(PROJECT_ID)?.name).toBe('Mine');
        });
    });

    // The disclosure US-33 accepts: the members of a project see the others' addresses. There is,
    // however, no route that lists or searches accounts -- the only entry is a project identifier.
    describe('GET /projects/:projectId/members', () => {
        it('returns the list, owners first', async () => {
            const response = await harness.request(`/projects/${PROJECT_ID}/members`);

            expect(response.status).toBe(200);
            const body = await response.json();
            expect(body).toEqual({
                members: [
                    { userId: ACCOUNT_ID, email: ADRESSE, role: 'owner' },
                    { userId: OTHER_ACCOUNT_ID, email: AUTRE_ADRESSE, role: 'member' },
                ],
            });
        });

        // The lesson of #344: the route built its DTO by assignment, and only the browser validated
        // the response. It is validated here.
        it('returns a response the contract accepts', async () => {
            const body = await (await harness.request(`/projects/${PROJECT_ID}/members`)).json();

            const lu = ProjectMemberListDto.safeParse(body);

            expect(
                lu.success ? [] : lu.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
            ).toEqual([]);
        });

        // 404 and not 403: a 403 would confirm the project exists to whoever guesses identifiers.
        it('answers like an absent project when the caller is not a member', async () => {
            const response = await harness.request(`/projects/${OTHER_PROJECT_ID}/members`);

            expect(response.status).toBe(404);
        });

        it('answers the same for a project nobody owns', async () => {
            const response = await harness.request(`/projects/${UNKNOWN_PROJECT_ID}/members`);

            expect(response.status).toBe(404);
        });
    });
});
