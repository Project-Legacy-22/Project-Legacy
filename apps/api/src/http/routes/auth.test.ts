import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';
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
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
import { makeAddProject, makeListProjects, makeRemoveProject } from '@legacy/core-projects';
// The reference fakes for the auth ports live with the ports they implement.
// Copying them here would let the copy drift from the contract it stands for.
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import type { InMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';
import { inMemoryProjectRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-project-repository.js';

import { createServer } from '../server.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../../test/fakes/unreachable-item-repository.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

// The loop lives in a helper function, not in a test: a test holds no logic, but the rate limit
// only triggers after several successive calls.
async function repeter(fois: number, tentative: () => Promise<Response>): Promise<Response[]> {
    const reponses: Response[] = [];

    for (let essai = 0; essai < fois; essai += 1) reponses.push(await tentative());

    return reponses;
}

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';

// The item repository refuses every call: a request reaching it without a session would answer 500
// instead of the expected refusal, and the test would see it.
function useCasesOver(provider: InMemoryIdentityProvider): AppUseCases {
    const repository = unreachableItemRepository();
    // No account: the routes exercised here do not touch personal data, and an empty store makes it
    // visible if one of them starts to.
    const personalData = inMemoryPersonalDataStore();
    const compromisedPasswords = inMemoryCompromisedPasswords();
    const projects = inMemoryProjectRepository();

    return makeAppUseCases({
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({
                repository,
                newId: () => ACCOUNT_ID,
                now: () => new Date('2026-09-04T10:00:00.000Z'),
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
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({ provider, compromisedPasswords }),
            signOut: makeSignOut(provider),
        },
        account: {
            exportPersonalData: makeExportPersonalData({
                store: personalData,
                now: () => new Date('2026-09-04T10:00:00.000Z'),
            }),
            eraseAccount: makeEraseAccount({
                store: personalData,
                identity: provider,
            }),
        },
        projects: {
            listProjects: makeListProjects(projects),
            addProject: makeAddProject({
                repository: projects,
                newId: () => ACCOUNT_ID,
            }),
            removeProject: makeRemoveProject(projects),
        },
    });
}

describe('authentication API', () => {
    let harness: Harness;

    async function serve(inscrits: { id: string; email: string; password: string }[] = []) {
        const logger = recordingLogger();
        const provider = inMemoryIdentityProvider(inscrits);
        harness = await listen(createServer(testConfig, useCasesOver(provider), { logger: logger }), logger);
    }

    const compteExistant = [{ id: ACCOUNT_ID, email: ADRESSE, password: MOT_DE_PASSE }];

    beforeEach(() => serve());
    afterEach(() => harness.close());

    describe('POST /auth/register', () => {
        it('creates an account that can be used to sign in', async () => {
            const inscription = await harness.request(
                '/auth/register',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE, acceptsPrivacyPolicy: true, policyVersion: PRIVACY_POLICY_VERSION }),
            );
            const connexion = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
            );

            expect(inscription.status).toBe(201);
            expect(connexion.status).toBe(200);
        });

        // The blocking criterion of US-11: nothing in the response must reveal whether the address
        // was already taken. Status, body and headers are compared, not only the status.
        it('answers identically for a free address and a taken one', async () => {
            await serve(compteExistant);

            const surAdressePrise = await harness.request(
                '/auth/register',
                json('POST', { email: ADRESSE, password: 'AutreMotDePasse7', acceptsPrivacyPolicy: true, policyVersion: PRIVACY_POLICY_VERSION }),
            );
            const surAdresseLibre = await harness.request(
                '/auth/register',
                json('POST', {
                    email: 'bob@example.com',
                    password: 'AutreMotDePasse7',
                    acceptsPrivacyPolicy: true,
                    policyVersion: PRIVACY_POLICY_VERSION,
                }),
            );

            expect(surAdressePrise.status).toBe(surAdresseLibre.status);
            expect(await surAdressePrise.text()).toBe(await surAdresseLibre.text());
            expect(surAdressePrise.headers.get('set-cookie')).toBe(surAdresseLibre.headers.get('set-cookie'));
        });

        // Creating an account does not sign in: a response that set a session would say, by its
        // mere presence, that the address was free.
        it('opens no session', async () => {
            const response = await harness.request(
                '/auth/register',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE, acceptsPrivacyPolicy: true, policyVersion: PRIVACY_POLICY_VERSION }),
            );

            expect(response.headers.get('set-cookie')).toBeNull();
            expect(await response.text()).toBe('');
        });

        it('refuses a password that is too short without creating an account', async () => {
            const inscription = await harness.request(
                '/auth/register',
                json('POST', { email: ADRESSE, password: 'Court1', acceptsPrivacyPolicy: true, policyVersion: PRIVACY_POLICY_VERSION }),
            );
            const connexion = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: 'Court1' }),
            );

            expect(inscription.status).toBe(400);
            expect(connexion.status).toBe(401);
        });

        it('refuses an address that is not one', async () => {
            const response = await harness.request(
                '/auth/register',
                json('POST', { email: 'pas-une-adresse', password: MOT_DE_PASSE, acceptsPrivacyPolicy: true, policyVersion: PRIVACY_POLICY_VERSION }),
            );

            expect(response.status).toBe(400);
        });
    });

    describe('consentement a la politique (US-37)', () => {
        // The US-37 criterion: the refusal is on the server side, not only in the form. A request
        // built by hand must not be able to create an account without consent.
        it('refuses a registration without consent, and does not create the account', async () => {
            const inscription = await harness.request(
                '/auth/register',
                json('POST', {
                    email: ADRESSE,
                    password: MOT_DE_PASSE,
                    policyVersion: PRIVACY_POLICY_VERSION,
                }),
            );
            const connexion = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
            );

            expect(inscription.status).toBe(400);
            expect(connexion.status).toBe(401);
        });

        it('refuses an explicitly negative consent', async () => {
            const response = await harness.request(
                '/auth/register',
                json('POST', {
                    email: ADRESSE,
                    password: MOT_DE_PASSE,
                    acceptsPrivacyPolicy: false,
                    policyVersion: PRIVACY_POLICY_VERSION,
                }),
            );

            expect(response.status).toBe(400);
        });

        // Otherwise a form left open during a policy update would record a consent to a text nobody
        // read.
        it('refuses a policy version that is not the published one', async () => {
            const response = await harness.request(
                '/auth/register',
                json('POST', {
                    email: ADRESSE,
                    password: MOT_DE_PASSE,
                    acceptsPrivacyPolicy: true,
                    policyVersion: '2020-01-01',
                }),
            );

            expect(response.status).toBe(400);
        });
    });

    describe('POST /auth/login', () => {
        it('returns the account and sets the session in an httpOnly cookie', async () => {
            await serve(compteExistant);

            const response = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
            );
            const cookie = response.headers.get('set-cookie') ?? '';

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual({
                id: ACCOUNT_ID,
                email: ADRESSE,
            });
            expect(cookie).toContain('HttpOnly');
            expect(cookie).toContain('SameSite=Lax');
        });

        it('does not tell a wrong password from an unknown address', async () => {
            await serve(compteExistant);

            const motDePasseFaux = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: 'MauvaisMotDePasse1' }),
            );
            const adresseInconnue = await harness.request(
                '/auth/login',
                json('POST', { email: 'bob@example.com', password: MOT_DE_PASSE }),
            );

            expect(motDePasseFaux.status).toBe(401);
            expect(adresseInconnue.status).toBe(401);
            expect((await motDePasseFaux.json()) as { detail: string }).toMatchObject({
                detail: ((await adresseInconnue.json()) as { detail: string }).detail,
            });
        });

        it('logs neither the address nor the password', async () => {
            await serve(compteExistant);

            await harness.request('/auth/login', json('POST', { email: ADRESSE, password: MOT_DE_PASSE }));

            const journal = JSON.stringify(harness.logger.lines);
            expect(journal).not.toContain(ADRESSE);
            expect(journal).not.toContain(MOT_DE_PASSE);
        });

        it('never returns the password in the response', async () => {
            await serve(compteExistant);

            const response = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
            );

            expect(await response.text()).not.toContain(MOT_DE_PASSE);
        });

        // Ten attempts per window, calling address included: the eleventh is refused without the
        // provider being asked.
        it('refuses attempts beyond the rate limit', async () => {
            await serve(compteExistant);
            const tentative = () =>
                harness.request('/auth/login', json('POST', { email: ADRESSE, password: 'Faux1' }));

            const reponses = await repeter(11, tentative);

            expect(reponses.at(-1)?.status).toBe(429);
            expect(reponses.filter((response) => response.status === 429)).toHaveLength(1);
        });
    });

    describe('GET /auth/me', () => {
        it('refuses a request without a session', async () => {
            const response = await harness.request('/auth/me');

            expect(response.status).toBe(401);
        });

        it('refuses a session cookie nobody carries', async () => {
            const response = await harness.request('/auth/me', {
                headers: { Cookie: 'session=jeton-invente' },
            });

            expect(response.status).toBe(401);
        });

        it('returns the account of the session bearer', async () => {
            await serve(compteExistant);
            const connexion = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
            );
            const cookie = (connexion.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

            const response = await harness.request('/auth/me', {
                headers: { Cookie: cookie },
            });

            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual({
                id: ACCOUNT_ID,
                email: ADRESSE,
            });
        });
    });

    describe('access to items', () => {
        it('refuses to read items without a session', async () => {
            const response = await harness.request('/items');

            expect(response.status).toBe(401);
        });

        it('refuses to create an item without a session', async () => {
            const response = await harness.request(
                '/items',
                json('POST', { name: 'Acheter du pain' }));

            expect(response.status).toBe(401);
        });
    });
});
