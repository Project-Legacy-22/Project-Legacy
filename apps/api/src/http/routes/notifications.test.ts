import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IdentityProvider } from '@legacy/core-auth';
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
// Les doublures de reference vivent avec le port qu elles implementent. Les
// recopier ici laisserait la copie deriver du contrat qu elle represente.
import { inMemoryCompromisedPasswords } from '../../../../../packages/core/auth/test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../../../../packages/core/auth/test/fakes/in-memory-identity-provider.js';
import { inMemoryPersonalDataStore } from '../../../../../packages/core/auth/test/fakes/in-memory-personal-data-store.js';

import { createServer } from '../server.js';
import { SESSION_COOKIE } from '../session.js';
import type { AppUseCases } from '../../composition-root.js';
import { recordingLogger } from '../../../../../packages/contracts/test/fakes/recording-logger.js';
import { unreachableItemRepository } from '../../../test/fakes/unreachable-item-repository.js';
import { listen, testConfig } from '../../../test/http-harness.js';
import type { Harness } from '../../../test/http-harness.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

// Le depot d items refuse tout appel : cette route n en a pas besoin, et un
// appel qui l atteindrait repondrait 500 au lieu du resultat attendu.
function useCasesOver(provider: IdentityProvider): AppUseCases {
    const repository = unreachableItemRepository();
    const personalData = inMemoryPersonalDataStore();

    return {
        items: {
            listItems: makeListItems(repository),
            addItem: makeAddItem({ repository, newId: () => OWNER_ID, now: () => new Date() }),
            changeItem: makeChangeItem(repository),
            removeItem: makeRemoveItem(repository),
        },
        notifications: { countUnread: () => Promise.resolve(0) },
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
                store: personalData,
                now: () => new Date(),
            }),
            eraseAccount: makeEraseAccount({ store: personalData, identity: provider }),
        },
    };
}

describe('GET /notifications', () => {
    let harness: Harness;

    // La meme exigence de session que les autres routes protegees.
    beforeEach(async () => {
        const provider = inMemoryIdentityProvider([
            { id: OWNER_ID, email: ADRESSE, password: MOT_DE_PASSE },
        ]);
        const session = await makeSignIn(provider)(ADRESSE, MOT_DE_PASSE);
        const logger = recordingLogger();

        harness = await listen(
            createServer(testConfig, useCasesOver(provider), logger),
            logger,
            `${SESSION_COOKIE}=${session.accessToken}`,
        );
    });

    afterEach(() => harness.close());

    // L effet observable du flux evenementiel de US-10.
    it('renvoie le compte de notifications non lues du compte connecte', async () => {
        const response = await harness.request('/notifications');

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ unread: 0 });
    });
});
