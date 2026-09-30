import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PersonalDataExportDto } from '@legacy/contracts';
import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRenewSession,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
    makeSignOut,
} from '@legacy/core-auth';
import type { IdentityProvider, PersonalDataStore } from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
import { makeAddProject, makeListProjects, makeRemoveProject } from '@legacy/core-projects';
// The reference doubles live with the port they implement. Copying them here would let the copy
// drift from the contract it stands for.
import { anAccountWithData } from '../../../../../packages/core/auth/test/builders/personal-data.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';
import { inMemoryProjectRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-project-repository.js';

import { createServer } from '../server.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../../test/fakes/unreachable-item-repository.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

const MOT_DE_PASSE = 'MotDePasse2026';
const MOMENT = new Date('2026-09-08T12:00:00.000Z');
const ITEM_ID = '01996f00-0000-7000-8000-0000000000ff';
const ALICE = anAccountWithData('alice@example.com', 1);
const BOB = anAccountWithData('bob@example.com', 2);

// The item repository refuses every call: no route exercised here must reach it, and a request that
// did would answer 500 instead of the expected result, which the test would see.
function useCasesOver(provider: IdentityProvider, store: PersonalDataStore): AppUseCases {
    const repository = unreachableItemRepository();
    const projects = inMemoryProjectRepository();

    return makeAppUseCases({
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({
                repository,
                newId: () => ITEM_ID,
                now: () => MOMENT,
            }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        notifications: {
            countUnread: () => Promise.resolve(0),
        },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
            renewSession: makeRenewSession(provider),
            // No route exercised here resets a password. The use cases are composed anyway:
            // AuthUseCases requires them, and an empty double would hide a wiring forgotten in the
            // server.
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(),
            }),
            // No route exercised here signs out. Composed for the same reason as resetPassword
            // above.
            signOut: makeSignOut(provider),
        },
        account: {
            exportPersonalData: makeExportPersonalData({ store, now: () => MOMENT }),
            eraseAccount: makeEraseAccount({ store, identity: provider }),
        },
        projects: {
            listProjects: makeListProjects(projects),
            addProject: makeAddProject({
                repository: projects,
                newId: () => ITEM_ID,
            }),
            removeProject: makeRemoveProject(projects),
        },
    });
}

describe('personal data API', () => {
    let harness: Harness;

    beforeEach(async () => {
        const logger = recordingLogger();
        const provider = inMemoryIdentityProvider(
            [ALICE, BOB].map((compte) => ({
                id: compte.account.id,
                email: compte.account.email,
                password: MOT_DE_PASSE,
            })),
        );
        const useCases = useCasesOver(provider, inMemoryPersonalDataStore([ALICE, BOB]));

        harness = await listen(createServer(testConfig, useCases, { logger: logger }), logger);
    });

    afterEach(() => harness.close());

    // The session is obtained through the API rather than built: the cookie is httpOnly, and its
    // shape belongs to the HTTP layer, not to the test.
    async function sessionDe(email: string): Promise<string> {
        const connexion = await harness.request('/auth/login', json('POST', { email, password: MOT_DE_PASSE }));

        return (connexion.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    }

    function exporter(cookie: string): Promise<Response> {
        return harness.request('/auth/me/export', { headers: { Cookie: cookie } });
    }

    function supprimer(cookie: string, corps: unknown): Promise<Response> {
        const requete = json('DELETE', corps);

        return harness.request('/auth/me', {
            ...requete,
            headers: { ...requete.headers, Cookie: cookie },
        });
    }

    describe('GET /auth/me/export', () => {
        it('refuses a call without a session', async () => {
            const response = await harness.request('/auth/me/export');

            expect(response.status).toBe(401);
        });

        it('serves a copy that matches the contract, as an attachment', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await exporter(cookie);
            const corps: unknown = await response.json();

            expect(response.status).toBe(200);
            expect(response.headers.get('content-disposition')).toContain('attachment');
            expect(() => PersonalDataExportDto.parse(corps)).not.toThrow();
        });

        // The portability criterion: an export reduced to the account fails the issue. The five
        // tables the application fills today must be in it.
        it('covers the account, its projects, its memberships, its items and its notifications', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const corps: unknown = await (await exporter(cookie)).json();
            const copie = PersonalDataExportDto.parse(corps);

            expect(copie.account.email).toBe(ALICE.account.email);
            expect(copie.projects.map((project) => project.id)).toEqual([ALICE.projectId]);
            expect(copie.projectMemberships.map((membership) => membership.projectId)).toEqual([ALICE.projectId]);
            expect(copie.items.map((item) => item.id)).toEqual([ALICE.itemId]);
            expect(copie.notifications.map((notification) => notification.id)).toEqual([ALICE.notificationId]);
        });

        // The isolation criterion, stated on the served document: that file is what the person
        // receives, so it is the one that must carry no trace of another account.
        it('serves no data of another account', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const document = await (await exporter(cookie)).text();

            expect(document).not.toContain(BOB.account.email);
            expect(document).not.toContain(BOB.account.id);
            expect(document).not.toContain(BOB.projectId);
            expect(document).not.toContain(BOB.itemId);
        });
    });

    describe('DELETE /auth/me', () => {
        it('refuses a call without a session', async () => {
            const response = await harness.request('/auth/me', json('DELETE', { confirmation: ALICE.account.email }));

            expect(response.status).toBe(401);
        });

        it('refuses a request that carries no confirmation', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await supprimer(cookie, {});

            expect(response.status).toBe(400);
        });

        it('refuses a confirmation that is not the account\'s address', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await supprimer(cookie, {
                confirmation: BOB.account.email,
            });

            expect(response.status).toBe(422);
        });

        it('deletes the account and clears the session cookie', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await supprimer(cookie, {
                confirmation: ALICE.account.email,
            });

            expect(response.status).toBe(204);
            expect(response.headers.get('set-cookie')).toContain('session=;');
        });

        // Deletion signs out immediately: the same cookie, replayed on the request that identifies
        // the caller, is no longer honoured.
        it('makes the session that asked for the deletion unusable', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            await supprimer(cookie, { confirmation: ALICE.account.email });
            const apres = await harness.request('/auth/me', {
                headers: { Cookie: cookie },
            });

            expect(apres.status).toBe(401);
        });

        it('leaves the other accounts usable', async () => {
            const cookieAlice = await sessionDe(ALICE.account.email);

            await supprimer(cookieAlice, { confirmation: ALICE.account.email });
            const copie = await exporter(await sessionDe(BOB.account.email));

            expect(copie.status).toBe(200);
        });
    });
});
