import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { InvalidEmailChangeToken } from '../domain/account.js';
import { makeChangeEmail } from './change-email.js';
import { makeConfirmEmailChange } from './confirm-email-change.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const NEUVE = 'alice.neuf@example.com';

describe('confirmEmailChange', () => {
    it('bascule l identifiant vers la nouvelle adresse', async () => {
        const provider = inMemoryIdentityProvider([
            { id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE },
        ]);
        const session = await provider.authenticate(ADRESSE, MOT_DE_PASSE);
        await makeChangeEmail(provider)(
            {
                account: session?.account ?? { id: 'account-1', email: ADRESSE },
                accessToken: session?.accessToken ?? '',
                refreshToken: session?.refreshToken ?? '',
            },
            NEUVE,
        );

        await makeConfirmEmailChange(provider)(provider.emailChangeTokenFor(ADRESSE) ?? '');

        await expect(makeSignIn(provider)(NEUVE, MOT_DE_PASSE)).resolves.toBeDefined();
        await expect(makeSignIn(provider)(ADRESSE, MOT_DE_PASSE)).rejects.toThrow();
    });

    it('traduit un jeton rejete en lien de confirmation invalide', async () => {
        const confirmEmailChange = makeConfirmEmailChange({
            ...inMemoryIdentityProvider(),
            confirmEmailChange: () => Promise.resolve('token-rejected'),
        });

        await expect(confirmEmailChange('jeton-perime')).rejects.toBeInstanceOf(InvalidEmailChangeToken);
    });

    it('ne laisse pas le jeton dans le message d erreur', async () => {
        const confirmEmailChange = makeConfirmEmailChange({
            ...inMemoryIdentityProvider(),
            confirmEmailChange: () => Promise.resolve('token-rejected'),
        });

        const erreur = await confirmEmailChange('jeton-secret').catch((error: unknown) => error);

        expect((erreur as Error).message).not.toContain('jeton-secret');
    });
});
