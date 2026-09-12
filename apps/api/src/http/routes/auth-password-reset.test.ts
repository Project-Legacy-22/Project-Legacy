import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
// The reference fakes for a port live with the port they implement.
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import type { InMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryProjectRepository } from '../../../../../packages/core/projects/test/fakes/in-memory-project-repository.js';

import { createServer } from '../server.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../../test/fakes/unreachable-item-repository.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

async function repeter(fois: number, tentative: () => Promise<Response>): Promise<Response[]> {
    const reponses: Response[] = [];
    for (let essai = 0; essai < fois; essai += 1) reponses.push(await tentative());
    return reponses;
}

const ADRESSE = 'alice@example.com';
const ANCIEN = 'AncienMotDePasse1';
const NOUVEAU = 'NouveauMotDePasse2';
// A value seeded into the breached-password list for the test below.
const KNOWN_BREACHED = 'MotDePasseCompromis1';
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';
const COMPTE = [{ id: ACCOUNT_ID, email: ADRESSE, password: ANCIEN }];

function useCasesOver(provider: InMemoryIdentityProvider, compromised: string[]): AppUseCases {
    const repository = unreachableItemRepository();
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
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(compromised),
            }),
            signOut: makeSignOut(provider),
        },
        // Aucune route exercee ici ne touche aux donnees personnelles. Le
        // groupe est compose sur un magasin vide plutot qu omis : AppUseCases
        // l exige, et un magasin vide rend visible toute route qui s y mettrait.
        account: {
            exportPersonalData: makeExportPersonalData({
                store: inMemoryPersonalDataStore(),
                now: () => new Date('2026-09-04T10:00:00.000Z'),
            }),
            eraseAccount: makeEraseAccount({ store: inMemoryPersonalDataStore(), identity: provider }),
        },
        projects: {
            listProjects: makeListProjects(projects),
            addProject: makeAddProject({ repository: projects, newId: () => ACCOUNT_ID }),
            removeProject: makeRemoveProject(projects),
        },
    });
}

describe('API de reinitialisation de mot de passe', () => {
    let harness: Harness;
    let provider: InMemoryIdentityProvider;

    async function serve(compromised: string[] = []) {
        const logger = recordingLogger();
        provider = inMemoryIdentityProvider(COMPTE);
        harness = await listen(createServer(testConfig, useCasesOver(provider, compromised), { logger: logger }), logger);
    }

    async function jetonPour(email: string): Promise<string> {
        await harness.request('/auth/password/forgot', json('POST', { email }));
        return provider.recoveryTokenFor(email) ?? '';
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    describe('POST /auth/password/forgot', () => {
        it('repond a l identique sur une adresse inscrite et sur une adresse inconnue', async () => {
            const surInscrite = await harness.request(
                '/auth/password/forgot',
                json('POST', { email: ADRESSE }),
            );
            const surInconnue = await harness.request(
                '/auth/password/forgot',
                json('POST', { email: 'bob@example.com' }),
            );

            expect(surInscrite.status).toBe(202);
            expect(surInconnue.status).toBe(surInscrite.status);
            expect(await surInconnue.text()).toBe(await surInscrite.text());
            expect(surInscrite.headers.get('set-cookie')).toBeNull();
            expect(surInconnue.headers.get('set-cookie')).toBeNull();
        });

        // Express 5 laisse le corps indefini quand la requete ne porte pas de
        // type json. Le compteur par adresse s execute avant toute validation :
        // s il dereference ce corps, une requete malformee devient un 500 avec
        // une ligne "unhandled failure", la ou la frontiere doit un 400.
        it('refuse un corps absent plutot que d echouer en 500', async () => {
            const reponse = await harness.request('/auth/password/forgot', { method: 'POST' });

            expect(reponse.status).toBe(400);
            expect(harness.logger.lines.map(ligne => ligne.level)).not.toContain('error');
        });

        it('refuse une adresse qui n en est pas une', async () => {
            const response = await harness.request(
                '/auth/password/forgot',
                json('POST', { email: 'pas-une-adresse' }),
            );

            expect(response.status).toBe(400);
        });

        // Trois demandes par heure et par adresse : la quatrieme est refusee.
        it('limite les demandes par adresse', async () => {
            const demande = () =>
                harness.request('/auth/password/forgot', json('POST', { email: ADRESSE }));

            const reponses = await repeter(4, demande);

            expect(reponses.slice(0, 3).map(r => r.status)).toEqual([202, 202, 202]);
            expect(reponses[3]?.status).toBe(429);
        });

        it('ne met ni l adresse ni le mot de passe dans les journaux', async () => {
            await harness.request('/auth/password/forgot', json('POST', { email: ADRESSE }));

            const journal = JSON.stringify(harness.logger.lines);
            expect(journal).not.toContain(ADRESSE);
            expect(journal).not.toContain(ANCIEN);
        });
    });

    describe('POST /auth/password/reset', () => {
        it('change le mot de passe et revoque les sessions du compte', async () => {
            const connexion = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: ANCIEN }),
            );
            const cookie = (connexion.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

            const token = await jetonPour(ADRESSE);
            const reset = await harness.request(
                '/auth/password/reset',
                json('POST', { token, password: NOUVEAU }),
            );

            expect(reset.status).toBe(204);
            expect(reset.headers.get('set-cookie')).toBeNull();

            const avecAncienneSession = await harness.request('/auth/me', {
                headers: { Cookie: cookie },
            });
            expect(avecAncienneSession.status).toBe(401);

            const reconnexion = await harness.request(
                '/auth/login',
                json('POST', { email: ADRESSE, password: NOUVEAU }),
            );
            expect(reconnexion.status).toBe(200);
        });

        it('refuse un jeton inconnu, ou deja utilise', async () => {
            const token = await jetonPour(ADRESSE);

            const premier = await harness.request(
                '/auth/password/reset',
                json('POST', { token, password: NOUVEAU }),
            );
            const rejoue = await harness.request(
                '/auth/password/reset',
                json('POST', { token, password: 'EncoreUnAutre3' }),
            );
            const invente = await harness.request(
                '/auth/password/reset',
                json('POST', { token: 'jamais-emis', password: NOUVEAU }),
            );

            expect(premier.status).toBe(204);
            expect(rejoue.status).toBe(400);
            expect((await rejoue.json()) as { type: string }).toMatchObject({
                type: 'invalid_reset_token',
            });
            expect(invente.status).toBe(400);
        });

        it('invalide le premier lien quand un second est demande', async () => {
            const premierJeton = await jetonPour(ADRESSE);
            await jetonPour(ADRESSE);

            const response = await harness.request(
                '/auth/password/reset',
                json('POST', { token: premierJeton, password: NOUVEAU }),
            );

            expect(response.status).toBe(400);
        });

        it('refuse un mot de passe trop court ou compromis', async () => {
            await serve([KNOWN_BREACHED]);
            const token = await jetonPour(ADRESSE);

            const courtDeTrop = await harness.request(
                '/auth/password/reset',
                json('POST', { token, password: 'Court1' }),
            );
            const compromis = await harness.request(
                '/auth/password/reset',
                json('POST', { token, password: KNOWN_BREACHED }),
            );

            expect(courtDeTrop.status).toBe(400);
            expect(compromis.status).toBe(400);
            expect((await compromis.json()) as { type: string }).toMatchObject({
                type: 'compromised_password',
            });
        });

        it('ne laisse ni le jeton ni le nouveau mot de passe dans les journaux ou la reponse', async () => {
            const token = await jetonPour(ADRESSE);

            const reset = await harness.request(
                '/auth/password/reset',
                json('POST', { token, password: NOUVEAU }),
            );

            const journal = JSON.stringify(harness.logger.lines);
            expect(journal).not.toContain(token);
            expect(journal).not.toContain(NOUVEAU);
            expect(await reset.text()).toBe('');
        });

        it('partage la limite par origine avec la demande', async () => {
            const tentative = () =>
                harness.request(
                    '/auth/password/reset',
                    json('POST', { token: 'jeton-quelconque', password: NOUVEAU }),
                );

            const reponses = await repeter(11, tentative);

            expect(reponses.at(-1)?.status).toBe(429);
            expect(reponses.filter(r => r.status === 429)).toHaveLength(1);
        });
    });

    describe('GET /reset-password', () => {
        it('sert la coquille de l application pour le lien de recuperation', async () => {
            const response = await harness.request('/reset-password?token_hash=abc&type=recovery');

            expect(response.status).toBe(200);
            expect(response.headers.get('content-type')).toContain('text/html');
        });
    });
});
