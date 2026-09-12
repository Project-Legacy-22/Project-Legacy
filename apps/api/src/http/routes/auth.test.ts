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

// La boucle vit dans une fonction outillage, pas dans un test : un test ne
// contient pas de logique, mais la limite de frequence ne se declenche qu au
// bout de plusieurs appels successifs.
async function repeter(fois: number, tentative: () => Promise<Response>): Promise<Response[]> {
    const reponses: Response[] = [];

    for (let essai = 0; essai < fois; essai += 1) reponses.push(await tentative());

    return reponses;
}

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';

// Le depot d items refuse tout appel : une requete qui l atteindrait sans
// session repondrait 500 au lieu du refus attendu, et le test le verrait.
function useCasesOver(provider: InMemoryIdentityProvider): AppUseCases {
    const repository = unreachableItemRepository();
    // Aucun compte : les routes exercees ici ne touchent pas aux donnees
    // personnelles, et un magasin vide le rend visible si l une d elles s y met.
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

describe('API d authentification', () => {
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
        it('cree un compte utilisable pour se connecter', async () => {
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

        // Le critere bloquant de US-11 : rien dans la reponse ne doit permettre
        // de savoir si l adresse etait deja prise. Statut, corps et en-tetes
        // sont compares, pas seulement le statut.
        it('repond a l identique sur une adresse libre et sur une adresse prise', async () => {
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

        // Creer un compte ne connecte pas : une reponse qui poserait une session
        // dirait, par sa seule presence, que l adresse etait libre.
        it('n ouvre aucune session', async () => {
            const response = await harness.request(
                '/auth/register',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE, acceptsPrivacyPolicy: true, policyVersion: PRIVACY_POLICY_VERSION }),
            );

            expect(response.headers.get('set-cookie')).toBeNull();
            expect(await response.text()).toBe('');
        });

        it('refuse un mot de passe trop court sans creer de compte', async () => {
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

        it('refuse une adresse qui n en est pas une', async () => {
            const response = await harness.request(
                '/auth/register',
                json('POST', { email: 'pas-une-adresse', password: MOT_DE_PASSE, acceptsPrivacyPolicy: true, policyVersion: PRIVACY_POLICY_VERSION }),
            );

            expect(response.status).toBe(400);
        });
    });

    describe('consentement a la politique (US-37)', () => {
        // Le critere de US-37 : le refus est cote serveur, pas seulement dans
        // le formulaire. Une requete construite a la main ne doit pas pouvoir
        // creer un compte sans consentement.
        it('refuse une inscription sans consentement, et ne cree pas le compte', async () => {
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

        it('refuse un consentement explicitement negatif', async () => {
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

        // Un formulaire laisse ouvert pendant une mise a jour de la politique
        // enregistrerait sinon un consentement a un texte que personne n a lu.
        it('refuse une version de politique qui n est pas celle publiee', async () => {
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
        it('renvoie le compte et pose la session dans un cookie httpOnly', async () => {
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

        it('ne distingue pas un mot de passe faux d une adresse inconnue', async () => {
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

        it('ne journalise ni l adresse ni le mot de passe', async () => {
            await serve(compteExistant);

            await harness.request('/auth/login', json('POST', { email: ADRESSE, password: MOT_DE_PASSE }));

            const journal = JSON.stringify(harness.logger.lines);
            expect(journal).not.toContain(ADRESSE);
            expect(journal).not.toContain(MOT_DE_PASSE);
        });

        it('ne renvoie jamais le mot de passe dans la reponse', async () => {
            await serve(compteExistant);

            const response = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
            );

            expect(await response.text()).not.toContain(MOT_DE_PASSE);
        });

        // Dix tentatives par fenetre, adresse d appel comprise : la onzieme est
        // refusee sans que le fournisseur soit interroge.
        it('refuse les tentatives au-dela de la limite de frequence', async () => {
            await serve(compteExistant);
            const tentative = () =>
                harness.request('/auth/login', json('POST', { email: ADRESSE, password: 'Faux1' }));

            const reponses = await repeter(11, tentative);

            expect(reponses.at(-1)?.status).toBe(429);
            expect(reponses.filter((response) => response.status === 429)).toHaveLength(1);
        });
    });

    describe('GET /auth/me', () => {
        it('refuse une requete sans session', async () => {
            const response = await harness.request('/auth/me');

            expect(response.status).toBe(401);
        });

        it('refuse un cookie de session que personne ne porte', async () => {
            const response = await harness.request('/auth/me', {
                headers: { Cookie: 'session=jeton-invente' },
            });

            expect(response.status).toBe(401);
        });

        it('renvoie le compte du porteur de la session', async () => {
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

    describe('acces aux items', () => {
        it('refuse la lecture des items sans session', async () => {
            const response = await harness.request('/items');

            expect(response.status).toBe(401);
        });

        it('refuse la creation d un item sans session', async () => {
            const response = await harness.request(
                '/items',
                json('POST', { name: 'Acheter du pain' }));

            expect(response.status).toBe(401);
        });
    });
});
