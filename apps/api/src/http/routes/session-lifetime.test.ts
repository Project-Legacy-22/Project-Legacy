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
} from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
// Les doublures de reference vivent avec le port qu elles implementent. En
// recopier une ici laisserait la copie deriver du contrat qu elle represente.
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import type { InMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';

import { createServer } from '../server.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../../test/fakes/unreachable-item-repository.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';
const MOMENT = new Date('2026-09-10T09:00:00.000Z');
const HEURE_MS = 60 * 60 * 1000;
// L intervalle de reprise du fournisseur est de dix secondes
// (supabase/config.toml). Au-dela, un jeton deja echange est un jeton qui
// circule en deux endroits.
const APRES_L_INTERVALLE_MS = 11_000;
const JOUR_S = 24 * 60 * 60;

// Le depot d items refuse tout appel : aucune route exercee ici n a de raison
// de l atteindre, et une requete qui y arriverait repondrait 500 la ou le test
// attend un refus.
function useCasesOver(provider: InMemoryIdentityProvider): AppUseCases {
    const repository = unreachableItemRepository();
    const personalData = inMemoryPersonalDataStore();

    return {
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({ repository, newId: () => ACCOUNT_ID, now: () => MOMENT }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        notifications: {
            countUnread: () => Promise.resolve(0),
            listNotifications: () => Promise.reject(new Error('not exercised by this suite')),
            markNotificationRead: () => Promise.reject(new Error('not exercised by this suite')),
        },
        auth: {
            registerAccount: makeRegisterAccount(provider),
            signIn: makeSignIn(provider),
            identifyCaller: makeIdentifyCaller(provider),
            renewSession: makeRenewSession(provider),
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(),
            }),
            signOut: () => Promise.reject(new Error('not exercised by this suite')),
        },
        account: {
            exportPersonalData: makeExportPersonalData({ store: personalData, now: () => MOMENT }),
            eraseAccount: makeEraseAccount({ store: personalData, identity: provider }),
        },
    };
}

// Un navigateur garde ses cookies d une requete a l autre ; le harnais, non.
// Ce bocal joue ce role : il relit les Set-Cookie d une reponse et rend
// l en-tete Cookie de la suivante.
type Bocal = Record<string, string>;

function recolte(response: Response, bocal: Bocal = {}): Bocal {
    const suivant = { ...bocal };

    for (const brut of response.headers.getSetCookie()) {
        const paire = brut.split(';')[0] ?? '';
        const separateur = paire.indexOf('=');

        if (separateur !== -1) suivant[paire.slice(0, separateur)] = paire.slice(separateur + 1);
    }

    return suivant;
}

function entete(bocal: Bocal): string {
    return Object.entries(bocal)
        .map(([nom, valeur]) => `${nom}=${valeur}`)
        .join('; ');
}

function poseeParLaReponse(response: Response, nom: string): string {
    return response.headers.getSetCookie().find(brut => brut.startsWith(`${nom}=`)) ?? '';
}

describe('duree de vie de la session', () => {
    let harness: Harness;
    let instant: number;

    beforeEach(async () => {
        // L horloge est injectee dans la doublure du fournisseur : c est elle
        // qui decide quand un jeton d acces expire, donc le test avance le
        // temps au lieu d attendre.
        instant = MOMENT.getTime();
        const provider = inMemoryIdentityProvider(
            [{ id: ACCOUNT_ID, email: ADRESSE, password: MOT_DE_PASSE }],
            { now: () => instant },
        );
        const logger = recordingLogger();

        harness = await listen(createServer(testConfig, useCasesOver(provider), logger), logger);
    });

    afterEach(() => harness.close());

    function connexion(): Promise<Response> {
        return harness.request(
            '/auth/login',
            json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
        );
    }

    async function seConnecter(): Promise<Bocal> {
        return recolte(await connexion());
    }

    function lire(bocal: Bocal): Promise<Response> {
        return harness.request('/auth/me', { headers: { Cookie: entete(bocal) } });
    }

    describe('a la connexion', () => {
        it('pose le jeton de rafraichissement dans un cookie httpOnly, jamais lisible par la page', async () => {
            const response = await connexion();

            const refresh = poseeParLaReponse(response, 'refresh');

            expect(refresh).toContain('HttpOnly');
            expect(refresh).toContain('SameSite=Lax');
        });

        // Le cookie de session dure ce que dure le jeton d acces ; celui de
        // rafraichissement porte la borne d inactivite, et c est lui qui fait
        // survivre la session a la fermeture de l onglet.
        it('donne au cookie de rafraichissement la borne d inactivite d une journee', async () => {
            const response = await connexion();

            expect(poseeParLaReponse(response, 'refresh')).toContain(`Max-Age=${String(JOUR_S)}`);
        });
    });

    describe('en cours d usage', () => {
        it('renouvelle la session sans que l appelant l ait demande quand le jeton d acces a expire', async () => {
            const bocal = await seConnecter();
            const avant = bocal.session;

            instant += HEURE_MS + 1;
            const response = await lire(bocal);

            expect(response.status).toBe(200);
            expect(recolte(response, bocal).session).not.toBe(avant);
        });

        // L etat d un onglet rouvert le lendemain : le navigateur a laisse
        // tomber le cookie de session, dont le Max-Age est passe, et ne
        // presente plus que celui de rafraichissement.
        it('reprend la session quand le navigateur ne presente plus que le cookie de rafraichissement', async () => {
            const bocal = await seConnecter();

            instant += HEURE_MS + 1;
            const response = await lire({ refresh: bocal.refresh ?? '' });

            expect(response.status).toBe(200);
        });

        // Deux requetes parties ensemble presentent le meme jeton. En refuser
        // une ferait de la concurrence ordinaire une deconnexion.
        it('sert deux requetes concurrentes sur un jeton expire sans terminer la session', async () => {
            const bocal = await seConnecter();

            instant += HEURE_MS + 1;
            const [premiere, seconde] = await Promise.all([lire(bocal), lire(bocal)]);

            expect(premiere?.status).toBe(200);
            expect(seconde?.status).toBe(200);
        });
    });

    describe('a l expiration', () => {
        // Le critere de rotation de l issue #28, verifie de bout en bout : un
        // jeton deja echange qui revient hors de l intervalle de reprise
        // termine la session, et ce qu elle avait ouvert cesse de valoir.
        it('termine la session et revoque ses jetons quand un jeton deja echange revient trop tard', async () => {
            const bocal = await seConnecter();
            instant += HEURE_MS + 1;
            const renouvele = recolte(await lire(bocal), bocal);

            instant += APRES_L_INTERVALLE_MS;
            const rejeu = await lire(bocal);
            const apres = await lire(renouvele);

            expect(rejeu.status).toBe(401);
            expect(apres.status).toBe(401);
        });

        it('dit que la session a expire, au lieu de demander une connexion sans raison', async () => {
            const response = await harness.request('/auth/me', {
                headers: { Cookie: 'session=jeton-perime; refresh=jeton-perime' },
            });
            const body = (await response.json()) as { type: string; detail: string };

            expect(response.status).toBe(401);
            expect(body.type).toBe('session_expired');
            expect(body.detail).toContain('expired');
        });

        // Sans cela le navigateur represente les deux cookies a chaque requete
        // pendant une journee, et l interface continue de croire a une session.
        it('fait oublier les deux cookies au navigateur', async () => {
            const response = await harness.request('/auth/me', {
                headers: { Cookie: 'session=jeton-perime; refresh=jeton-perime' },
            });

            const oublies = response.headers
                .getSetCookie()
                .filter(brut => brut.includes('Expires=Thu, 01 Jan 1970'));

            expect(oublies).toHaveLength(2);
        });

        it('demande une connexion, sans parler d expiration, quand aucune session n a ete posee', async () => {
            const response = await harness.request('/auth/me');
            const body = (await response.json()) as { type: string };

            expect(response.status).toBe(401);
            expect(body.type).toBe('session_required');
        });
    });

    // Critere de l issue #28 : aucun jeton dans un journal, une URL ou un
    // message d erreur. Le renouvellement est le moment ou trois jetons
    // circulent ensemble, donc celui ou l on verifie.
    it('ne fait apparaitre aucun jeton dans le journal', async () => {
        const bocal = await seConnecter();
        instant += HEURE_MS + 1;
        const renouvele = recolte(await lire(bocal), bocal);

        const journal = JSON.stringify(harness.logger.lines);

        expect(journal).not.toContain(decodeURIComponent(bocal.session ?? ''));
        expect(journal).not.toContain(decodeURIComponent(bocal.refresh ?? ''));
        expect(journal).not.toContain(decodeURIComponent(renouvele.refresh ?? ''));
    });
});
