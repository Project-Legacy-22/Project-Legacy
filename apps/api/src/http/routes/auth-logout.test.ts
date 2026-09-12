import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    makeEraseAccount,
    makeExportPersonalData,
    makeIdentifyCaller,
    makeRegisterAccount,
    makeRequestPasswordReset,
    makeResetPassword,
    makeSignIn,
    makeSignOut,
} from '@legacy/core-auth';
import { makeAddItem, makeChangeItem, makeListItems, makeRemoveItem } from '@legacy/core-items';
// The reference fakes for a port live with the port they implement.
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import type { InMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';

import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../../test/fakes/unreachable-item-repository.js';
import { json, listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';
import { makeAppUseCases } from '../../../test/fakes/app-use-cases.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const ACCOUNT_ID = '00000000-0000-7000-8000-000000000001';
const COMPTE = [{ id: ACCOUNT_ID, email: ADRESSE, password: MOT_DE_PASSE }];

function useCasesOver(provider: InMemoryIdentityProvider): AppUseCases {
    const repository = unreachableItemRepository();

    return makeAppUseCases({
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({
                repository,
                newId: () => ACCOUNT_ID,
                now: () => new Date('2026-09-09T10:00:00.000Z'),
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
            requestPasswordReset: makeRequestPasswordReset(provider),
            resetPassword: makeResetPassword({
                provider,
                compromisedPasswords: inMemoryCompromisedPasswords(),
            }),
            signOut: makeSignOut(provider),
        },
        account: {
            exportPersonalData: makeExportPersonalData({
                store: inMemoryPersonalDataStore(),
                now: () => new Date('2026-09-09T10:00:00.000Z'),
            }),
            eraseAccount: makeEraseAccount({ store: inMemoryPersonalDataStore(), identity: provider }),
        },
    });
}

describe('POST /auth/logout', () => {
    let harness: Harness;
    let provider: InMemoryIdentityProvider;

    async function serve() {
        const logger = recordingLogger();
        provider = inMemoryIdentityProvider(COMPTE);
        harness = await listen(createServer(testConfig, useCasesOver(provider), { logger: logger }), logger);
    }

    async function seSeConnecter(): Promise<string> {
        const connexion = await harness.request(
            '/auth/login',
            json('POST', { email: ADRESSE, password: MOT_DE_PASSE }),
        );
        return (connexion.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    }

    beforeEach(() => serve());
    afterEach(() => harness.close());

    it('revoque la session : le jeton ne rouvre plus /auth/me', async () => {
        const cookie = await seSeConnecter();
        expect((await harness.request('/auth/me', { headers: { Cookie: cookie } })).status).toBe(200);

        const deconnexion = await harness.request('/auth/logout', {
            method: 'POST',
            headers: { Cookie: cookie },
        });

        expect(deconnexion.status).toBe(204);
        expect((await harness.request('/auth/me', { headers: { Cookie: cookie } })).status).toBe(401);
    });

    it('efface le cookie avec les memes attributs qu a la connexion', async () => {
        const cookie = await seSeConnecter();

        const deconnexion = await harness.request('/auth/logout', {
            method: 'POST',
            headers: { Cookie: cookie },
        });

        const efface = deconnexion.headers.get('set-cookie') ?? '';
        expect(efface).toContain('HttpOnly');
        expect(efface).toContain('SameSite=Lax');
        expect(efface).toContain('Path=/');
        // Un cookie efface porte une date d expiration passee plutot qu un
        // Max-Age positif : c est ce qui dit au navigateur de l oublier.
        expect(efface.toLowerCase()).toContain('expires=');
    });

    // Critere bloquant : rien ne doit distinguer "avait une session" de "n en
    // avait pas". Statut et corps sont compares, pas seulement l un des deux.
    it('repond a l identique avec et sans session valide', async () => {
        const cookie = await seSeConnecter();

        const avecSession = await harness.request('/auth/logout', {
            method: 'POST',
            headers: { Cookie: cookie },
        });
        const sansSession = await harness.request('/auth/logout', { method: 'POST' });
        const jetonInvente = await harness.request('/auth/logout', {
            method: 'POST',
            headers: { Cookie: `${SESSION_COOKIE}=jeton-invente` },
        });

        expect(avecSession.status).toBe(204);
        expect(sansSession.status).toBe(avecSession.status);
        expect(jetonInvente.status).toBe(avecSession.status);
        expect(await sansSession.text()).toBe(await avecSession.text());
        expect(await jetonInvente.text()).toBe(await avecSession.text());
    });

    it('ne journalise pas le jeton de session', async () => {
        const cookie = await seSeConnecter();

        await harness.request('/auth/logout', { method: 'POST', headers: { Cookie: cookie } });

        const journal = JSON.stringify(harness.logger.lines);
        expect(journal).not.toContain(cookie.split('=')[1]);
    });
});
