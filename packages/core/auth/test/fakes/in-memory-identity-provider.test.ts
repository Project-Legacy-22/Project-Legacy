import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from './in-memory-identity-provider.js';

const ADRESSE = 'alice@example.com';
const ANCIEN = 'AncienMotDePasse1';
const NOUVEAU = 'NouveauMotDePasse2';

// The fake stands in for GoTrue's recovery flow in the use-case and API tests.
// These checks pin the behaviour those tests lean on: single-use tokens, an
// expiry, one live token per account, and session revocation on reset.

function provider(now?: () => number) {
    return inMemoryIdentityProvider(
        [{ id: 'account-1', email: ADRESSE, password: ANCIEN }],
        now === undefined ? {} : { now },
    );
}

describe('inMemoryIdentityProvider recovery flow', () => {
    it('consomme le jeton : un second usage est rejete', async () => {
        const p = provider();
        await p.requestPasswordReset(ADRESSE);
        const token = p.recoveryTokenFor(ADRESSE) ?? '';

        await expect(p.resetPassword(token, NOUVEAU)).resolves.toBe('password-changed');
        await expect(p.resetPassword(token, 'EncoreUnAutre3')).resolves.toBe('token-rejected');
    });

    it('n a qu un jeton vivant : une nouvelle demande invalide la precedente', async () => {
        const p = provider();
        await p.requestPasswordReset(ADRESSE);
        const premier = p.recoveryTokenFor(ADRESSE) ?? '';
        await p.requestPasswordReset(ADRESSE);

        await expect(p.resetPassword(premier, NOUVEAU)).resolves.toBe('token-rejected');
    });

    it('rejette un jeton expire', async () => {
        let instant = 1_000_000;
        const p = provider(() => instant);
        await p.requestPasswordReset(ADRESSE);
        const token = p.recoveryTokenFor(ADRESSE) ?? '';

        instant += 60 * 60 * 1000 + 1;

        await expect(p.resetPassword(token, NOUVEAU)).resolves.toBe('token-rejected');
    });

    it('revoque les sessions en cours : un jeton d acces anterieur cesse d etre reconnu', async () => {
        const p = provider();
        const before = await p.authenticate(ADRESSE, ANCIEN);
        await p.requestPasswordReset(ADRESSE);
        const token = p.recoveryTokenFor(ADRESSE) ?? '';

        await p.resetPassword(token, NOUVEAU);

        expect(before).toBeDefined();
        await expect(p.identify(before?.accessToken ?? '')).resolves.toBeUndefined();
    });

    it('ne pose aucun jeton pour une adresse inconnue', async () => {
        const p = provider();

        await p.requestPasswordReset('bob@example.com');

        expect(p.recoveryTokenFor('bob@example.com')).toBeUndefined();
    });
});
