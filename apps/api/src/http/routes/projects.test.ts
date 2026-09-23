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
import { ProjectMemberListDto } from '@legacy/contracts';

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

// Le projet partage de ces cas : la titulaire de la session, proprietaire, et
// un second membre. OTHER_PROJECT_ID n appartient qu a l autre compte, ce qui
// donne le cas du projet existant dont on n est pas membre.
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

    // La divulgation assumee de US-33 : les membres d un projet voient
    // l adresse des autres. Il n existe en revanche aucune route qui liste ou
    // cherche des comptes -- l entree unique est un identifiant de projet.
    describe('GET /projects/:projectId/members', () => {
        it('rend la liste, proprietaires en tete', async () => {
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

        // La lecon de #344 : la route construisait son DTO par affectation, et
        // seul le navigateur validait la reponse. On la valide ici.
        it('rend une reponse que le contrat accepte', async () => {
            const body = await (await harness.request(`/projects/${PROJECT_ID}/members`)).json();

            const lu = ProjectMemberListDto.safeParse(body);

            expect(
                lu.success ? [] : lu.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
            ).toEqual([]);
        });

        // 404 et non 403 : un 403 confirmerait que le projet existe a qui
        // devine des identifiants.
        it('repond comme un projet inexistant quand on n en est pas membre', async () => {
            const response = await harness.request(`/projects/${OTHER_PROJECT_ID}/members`);

            expect(response.status).toBe(404);
        });

        it('repond de meme pour un projet que personne ne possede', async () => {
            const response = await harness.request(`/projects/${UNKNOWN_PROJECT_ID}/members`);

            expect(response.status).toBe(404);
        });
    });
});
