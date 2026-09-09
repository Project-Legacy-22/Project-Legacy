import { describe, expect, it, vi } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import type { IdentityProvider } from '../ports/identity-provider.js';
import { makeRequestPasswordReset } from './request-password-reset.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

function providerAvecCompte() {
    return inMemoryIdentityProvider([{ id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE }]);
}

describe('requestPasswordReset', () => {
    it('demande au fournisseur d envoyer un lien pour l adresse normalisee', async () => {
        const provider = providerAvecCompte();
        const spy = vi.spyOn(provider, 'requestPasswordReset');
        const requestPasswordReset = makeRequestPasswordReset(provider);

        await requestPasswordReset('  ALICE@Example.com ');

        expect(spy).toHaveBeenCalledWith(ADRESSE);
        expect(provider.recoveryTokenFor(ADRESSE)).toEqual(expect.any(String));
    });

    // Le critere central de US-28 : la demande ne doit pas reveler si l adresse
    // est connue. Le cas d usage ne branche pas, et ne renvoie rien.
    it('repond de la meme facon pour une adresse connue et une adresse inconnue', async () => {
        const provider = providerAvecCompte();
        const requestPasswordReset = makeRequestPasswordReset(provider);

        const surConnue = await requestPasswordReset(ADRESSE);
        const surInconnue = await requestPasswordReset('bob@example.com');

        expect(surConnue).toBeUndefined();
        expect(surInconnue).toBeUndefined();
    });

    it('n echoue pas quand l adresse n a pas de compte', async () => {
        const provider = providerAvecCompte();
        const requestPasswordReset = makeRequestPasswordReset(provider);

        await expect(requestPasswordReset('bob@example.com')).resolves.toBeUndefined();
    });

    it('laisse une panne du fournisseur remonter', async () => {
        const provider: IdentityProvider = {
            ...providerAvecCompte(),
            requestPasswordReset: () => Promise.reject(new Error('provider down')),
        };
        const requestPasswordReset = makeRequestPasswordReset(provider);

        await expect(requestPasswordReset(ADRESSE)).rejects.toThrow('provider down');
    });
});
