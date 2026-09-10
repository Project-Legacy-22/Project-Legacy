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
} from '@legacy/core-auth';
import type { IdentityProvider, PersonalDataStore } from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
// Les doublures de reference vivent avec le port qu elles implementent. Les
// recopier ici laisserait la copie deriver du contrat qu elle represente.
import { anAccountWithData } from '../../../../../packages/core/auth/test/builders/personal-data.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';

import { createServer } from '../server.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../../test/fakes/unreachable-item-repository.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';

const MOT_DE_PASSE = 'MotDePasse2026';
const MOMENT = new Date('2026-09-08T12:00:00.000Z');
const ITEM_ID = '01996f00-0000-7000-8000-0000000000ff';
const ALICE = anAccountWithData('alice@example.com', 1);
const BOB = anAccountWithData('bob@example.com', 2);

// Le depot d items refuse tout appel : aucune route exercee ici ne doit
// l atteindre, et une requete qui le ferait repondrait 500 au lieu du resultat
// attendu, ce que le test verrait.
function useCasesOver(provider: IdentityProvider, store: PersonalDataStore): AppUseCases {
    const repository = unreachableItemRepository();

    return {
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({ repository, newId: () => ITEM_ID, now: () => MOMENT }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        notifications: { countUnread: () => Promise.resolve(0) },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
            renewSession: makeRenewSession(provider),
            // Aucune route exercee ici ne reinitialise de mot de passe. Les cas
            // d usage sont composes quand meme : AuthUseCases les exige, et un
            // double vide masquerait un branchement oublie dans le serveur.
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(),
            }),
        },
        account: {
            exportPersonalData: makeExportPersonalData({ store, now: () => MOMENT }),
            eraseAccount: makeEraseAccount({ store, identity: provider }),
        },
    };
}

describe('API des donnees personnelles', () => {
    let harness: Harness;

    beforeEach(async () => {
        const logger = recordingLogger();
        const provider = inMemoryIdentityProvider(
            [ALICE, BOB].map(compte => ({
                id: compte.account.id,
                email: compte.account.email,
                password: MOT_DE_PASSE,
            })),
        );
        const useCases = useCasesOver(provider, inMemoryPersonalDataStore([ALICE, BOB]));

        harness = await listen(createServer(testConfig, useCases, logger), logger);
    });

    afterEach(() => harness.close());

    // La session est obtenue par l API plutot que fabriquee : le cookie est
    // httpOnly, et sa forme appartient a la couche HTTP, pas au test.
    async function sessionDe(email: string): Promise<string> {
        const connexion = await harness.request(
            '/auth/login',
            json('POST', { email, password: MOT_DE_PASSE }),
        );

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
        it('refuse un appel sans session', async () => {
            const response = await harness.request('/auth/me/export');

            expect(response.status).toBe(401);
        });

        it('sert une copie conforme au contrat, en piece jointe', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await exporter(cookie);
            const corps: unknown = await response.json();

            expect(response.status).toBe(200);
            expect(response.headers.get('content-disposition')).toContain('attachment');
            expect(() => PersonalDataExportDto.parse(corps)).not.toThrow();
        });

        // Le critere de portabilite : un export reduit au compte est un echec
        // de l issue. Les trois tables que l application remplit aujourd hui
        // doivent y figurer.
        it('couvre le compte, ses items et ses notifications', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const corps: unknown = await (await exporter(cookie)).json();
            const copie = PersonalDataExportDto.parse(corps);

            expect(copie.account.email).toBe(ALICE.account.email);
            expect(copie.items.map(item => item.id)).toEqual([ALICE.itemId]);
            expect(copie.notifications.map(notification => notification.id)).toEqual([
                ALICE.notificationId,
            ]);
        });

        // Le critere d isolation, enonce sur le document servi : c est ce
        // fichier que la personne recoit, donc c est lui qui ne doit porter
        // aucune trace d un autre compte.
        it('ne sert aucune donnee d un autre compte', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const document = await (await exporter(cookie)).text();

            expect(document).not.toContain(BOB.account.email);
            expect(document).not.toContain(BOB.account.id);
            expect(document).not.toContain(BOB.itemId);
        });
    });

    describe('DELETE /auth/me', () => {
        it('refuse un appel sans session', async () => {
            const response = await harness.request(
                '/auth/me',
                json('DELETE', { confirmation: ALICE.account.email }),
            );

            expect(response.status).toBe(401);
        });

        it('refuse une requete qui ne porte pas de confirmation', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await supprimer(cookie, {});

            expect(response.status).toBe(400);
        });

        it('refuse une confirmation qui n est pas l adresse du compte', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await supprimer(cookie, { confirmation: BOB.account.email });

            expect(response.status).toBe(422);
        });

        it('supprime le compte et vide le cookie de session', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            const response = await supprimer(cookie, { confirmation: ALICE.account.email });

            expect(response.status).toBe(204);
            expect(response.headers.get('set-cookie')).toContain('session=;');
        });

        // La suppression deconnecte immediatement : le meme cookie, rejoue sur
        // la requete qui identifie l appelant, n est plus honore.
        it('rend inutilisable la session qui a demande la suppression', async () => {
            const cookie = await sessionDe(ALICE.account.email);

            await supprimer(cookie, { confirmation: ALICE.account.email });
            const apres = await harness.request('/auth/me', { headers: { Cookie: cookie } });

            expect(apres.status).toBe(401);
        });

        it('laisse les autres comptes utilisables', async () => {
            const cookieAlice = await sessionDe(ALICE.account.email);

            await supprimer(cookieAlice, { confirmation: ALICE.account.email });
            const copie = await exporter(await sessionDe(BOB.account.email));

            expect(copie.status).toBe(200);
        });
    });
});
