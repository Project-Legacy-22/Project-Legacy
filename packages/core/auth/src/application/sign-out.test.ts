import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { makeIdentifyCaller } from './identify-caller.js';
import { makeSignIn } from './sign-in.js';
import { makeSignOut } from './sign-out.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

function provider() {
    return inMemoryIdentityProvider([
        { id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE },
    ]);
}

describe('signOut', () => {
    it('rend le jeton de la session inutilisable', async () => {
        const fournisseur = provider();
        const session = await makeSignIn(fournisseur)(ADRESSE, MOT_DE_PASSE);

        await makeSignOut(fournisseur)(session.accessToken);

        await expect(makeIdentifyCaller(fournisseur)(session.accessToken)).resolves.toBeUndefined();
    });

    it('ne fait rien sans jeton, sans echouer', async () => {
        await expect(makeSignOut(provider())(undefined)).resolves.toBeUndefined();
    });

    it('reste un succes sur un jeton deja invalide', async () => {
        await expect(makeSignOut(provider())('jeton-invente')).resolves.toBeUndefined();
    });
});
