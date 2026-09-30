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
// The reference doubles live with the port they implement. Copying one here would let the copy
// drift from the contract it stands for.
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
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';
const MOMENT = new Date('2026-09-10T09:00:00.000Z');
const HEURE_MS = 60 * 60 * 1000;
// The provider's reuse interval is ten seconds (supabase/config.toml). Beyond it, a token already
// exchanged is a token circulating in two places.
const APRES_L_INTERVALLE_MS = 11_000;
const JOUR_S = 24 * 60 * 60;

// The item repository refuses every call: no route exercised here has any reason to reach it, and a
// request getting there would answer 500 where the test expects a refusal.
function useCasesOver(provider: InMemoryIdentityProvider): AppUseCases {
    const repository = unreachableItemRepository();
    const personalData = inMemoryPersonalDataStore();

    return makeAppUseCases({
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({ repository, newId: () => ACCOUNT_ID, now: () => MOMENT }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        notifications: { countUnread: () => Promise.resolve(0) },
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
        },
        account: {
            exportPersonalData: makeExportPersonalData({ store: personalData, now: () => MOMENT }),
            eraseAccount: makeEraseAccount({ store: personalData, identity: provider }),
        },
    });
}

// A browser keeps its cookies from one request to the next; the harness does not. This jar plays
// that role: it reads the Set-Cookie of a response and returns the Cookie header of the next one.
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

describe('session lifetime', () => {
    let harness: Harness;
    let instant: number;

    beforeEach(async () => {
        // The clock is injected into the provider double: it decides when an access token expires,
        // so the test moves time forward instead of waiting.
        instant = MOMENT.getTime();
        const provider = inMemoryIdentityProvider(
            [{ id: ACCOUNT_ID, email: ADRESSE, password: MOT_DE_PASSE }],
            { now: () => instant },
        );
        const logger = recordingLogger();

        harness = await listen(createServer(testConfig, useCasesOver(provider), { logger: logger }), logger);
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
        it('sets the refresh token in an httpOnly cookie, never readable by the page', async () => {
            const response = await connexion();

            const refresh = poseeParLaReponse(response, 'refresh');

            expect(refresh).toContain('HttpOnly');
            expect(refresh).toContain('SameSite=Lax');
        });

        // The session cookie lasts as long as the access token; the refresh one carries the
        // inactivity bound, and it is what lets the session survive closing the tab.
        it('gives the refresh cookie the one-day inactivity bound', async () => {
            const response = await connexion();

            expect(poseeParLaReponse(response, 'refresh')).toContain(`Max-Age=${String(JOUR_S)}`);
        });
    });

    describe('during use', () => {
        it('renews the session without the caller asking when the access token has expired', async () => {
            const bocal = await seConnecter();
            const avant = bocal.session;

            instant += HEURE_MS + 1;
            const response = await lire(bocal);

            expect(response.status).toBe(200);
            expect(recolte(response, bocal).session).not.toBe(avant);
        });

        // The state of a tab reopened the next day: the browser dropped the session cookie, whose
        // Max-Age has passed, and only presents the refresh one.
        it('resumes the session when the browser only presents the refresh cookie', async () => {
            const bocal = await seConnecter();

            instant += HEURE_MS + 1;
            const response = await lire({ refresh: bocal.refresh ?? '' });

            expect(response.status).toBe(200);
        });

        // Two requests sent together present the same token. Refusing one would turn ordinary
        // concurrency into a sign-out.
        it('serves two concurrent requests on an expired token without ending the session', async () => {
            const bocal = await seConnecter();

            instant += HEURE_MS + 1;
            const [premiere, seconde] = await Promise.all([lire(bocal), lire(bocal)]);

            expect(premiere?.status).toBe(200);
            expect(seconde?.status).toBe(200);
        });
    });

    describe('a l expiration', () => {
        // The rotation criterion of issue #28, checked end to end: a token already exchanged that
        // comes back outside the reuse interval ends the session, and what it had opened stops
        // being valid.
        it('ends the session and revokes its tokens when an exchanged token comes back too late', async () => {
            const bocal = await seConnecter();
            instant += HEURE_MS + 1;
            const renouvele = recolte(await lire(bocal), bocal);

            instant += APRES_L_INTERVALLE_MS;
            const rejeu = await lire(bocal);
            const apres = await lire(renouvele);

            expect(rejeu.status).toBe(401);
            expect(apres.status).toBe(401);
        });

        it('says the session has expired, instead of asking for a sign-in for no reason', async () => {
            const response = await harness.request('/auth/me', {
                headers: { Cookie: 'session=jeton-perime; refresh=jeton-perime' },
            });
            const body = (await response.json()) as { type: string; detail: string };

            expect(response.status).toBe(401);
            expect(body.type).toBe('session_expired');
            expect(body.detail).toContain('expired');
        });

        // Otherwise the browser presents both cookies on every request for a day, and the interface
        // keeps believing in a session.
        it('makes the browser forget both cookies', async () => {
            const response = await harness.request('/auth/me', {
                headers: { Cookie: 'session=jeton-perime; refresh=jeton-perime' },
            });

            const oublies = response.headers
                .getSetCookie()
                .filter(brut => brut.includes('Expires=Thu, 01 Jan 1970'));

            expect(oublies).toHaveLength(2);
        });

        it('asks for a sign-in, without mentioning expiry, when no session was set', async () => {
            const response = await harness.request('/auth/me');
            const body = (await response.json()) as { type: string };

            expect(response.status).toBe(401);
            expect(body.type).toBe('session_required');
        });
    });

    // Criterion of issue #28: no token in a log, a URL or an error message. Renewal is the moment
    // three tokens travel together, so it is the one to check.
    it('lets no token appear in the log', async () => {
        const bocal = await seConnecter();
        instant += HEURE_MS + 1;
        const renouvele = recolte(await lire(bocal), bocal);

        const journal = JSON.stringify(harness.logger.lines);

        expect(journal).not.toContain(decodeURIComponent(bocal.session ?? ''));
        expect(journal).not.toContain(decodeURIComponent(bocal.refresh ?? ''));
        expect(journal).not.toContain(decodeURIComponent(renouvele.refresh ?? ''));
    });
});
