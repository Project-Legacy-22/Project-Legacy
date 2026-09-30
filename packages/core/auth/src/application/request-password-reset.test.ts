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
    it('asks the provider to send a link for the normalised address', async () => {
        const provider = providerAvecCompte();
        const spy = vi.spyOn(provider, 'requestPasswordReset');
        const requestPasswordReset = makeRequestPasswordReset(provider);

        await requestPasswordReset('  ALICE@Example.com ');

        expect(spy).toHaveBeenCalledWith(ADRESSE);
        expect(provider.recoveryTokenFor(ADRESSE)).toEqual(expect.any(String));
    });

    // The central criterion of US-28: the request must not reveal whether the address is known. The
    // use case does not branch, and returns nothing.
    it('answers the same way for a known address and an unknown one', async () => {
        const provider = providerAvecCompte();
        const requestPasswordReset = makeRequestPasswordReset(provider);

        const surConnue = await requestPasswordReset(ADRESSE);
        const surInconnue = await requestPasswordReset('bob@example.com');

        expect(surConnue).toBeUndefined();
        expect(surInconnue).toBeUndefined();
    });

    it('does not fail when the address has no account', async () => {
        const provider = providerAvecCompte();
        const requestPasswordReset = makeRequestPasswordReset(provider);

        await expect(requestPasswordReset('bob@example.com')).resolves.toBeUndefined();
    });

    it('lets a provider outage propagate', async () => {
        const provider: IdentityProvider = {
            ...providerAvecCompte(),
            requestPasswordReset: () => Promise.reject(new Error('provider down')),
        };
        const requestPasswordReset = makeRequestPasswordReset(provider);

        await expect(requestPasswordReset(ADRESSE)).rejects.toThrow('provider down');
    });
});
