import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { makeIdentifyCaller } from './identify-caller.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

function provider() {
    return inMemoryIdentityProvider([
        { id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE },
    ]);
}

describe('identifyCaller', () => {
    it('reconnait le porteur du jeton emis a la connexion', async () => {
        const fournisseur = provider();
        const session = await makeSignIn(fournisseur)(ADRESSE, MOT_DE_PASSE);

        const account = await makeIdentifyCaller(fournisseur)(session.accessToken);

        expect(account).toEqual({ id: 'account-1', email: ADRESSE });
    });

    it('ne reconnait personne derriere un jeton inconnu', async () => {
        const account = await makeIdentifyCaller(provider())('jeton-invente');

        expect(account).toBeUndefined();
    });
});
