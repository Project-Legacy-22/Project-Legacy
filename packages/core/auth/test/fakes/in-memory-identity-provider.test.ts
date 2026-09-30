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
    it('consumes the token: a second use is rejected', async () => {
        const p = provider();
        await p.requestPasswordReset(ADRESSE);
        const token = p.recoveryTokenFor(ADRESSE) ?? '';

        await expect(p.resetPassword(token, NOUVEAU)).resolves.toBe('password-changed');
        await expect(p.resetPassword(token, 'EncoreUnAutre3')).resolves.toBe('token-rejected');
    });

    it('keeps a single live token: a new request invalidates the previous one', async () => {
        const p = provider();
        await p.requestPasswordReset(ADRESSE);
        const premier = p.recoveryTokenFor(ADRESSE) ?? '';
        await p.requestPasswordReset(ADRESSE);

        await expect(p.resetPassword(premier, NOUVEAU)).resolves.toBe('token-rejected');
    });

    it('rejects an expired token', async () => {
        let instant = 1_000_000;
        const p = provider(() => instant);
        await p.requestPasswordReset(ADRESSE);
        const token = p.recoveryTokenFor(ADRESSE) ?? '';

        instant += 60 * 60 * 1000 + 1;

        await expect(p.resetPassword(token, NOUVEAU)).resolves.toBe('token-rejected');
    });

    it('revokes the current sessions: an earlier access token stops being recognised', async () => {
        const p = provider();
        const before = await p.authenticate(ADRESSE, ANCIEN);
        await p.requestPasswordReset(ADRESSE);
        const token = p.recoveryTokenFor(ADRESSE) ?? '';

        await p.resetPassword(token, NOUVEAU);

        expect(before).toBeDefined();
        await expect(p.identify(before?.accessToken ?? '')).resolves.toBeUndefined();
    });

    it('sets no token for an unknown address', async () => {
        const p = provider();

        await p.requestPasswordReset('bob@example.com');

        expect(p.recoveryTokenFor('bob@example.com')).toBeUndefined();
    });
});

// The rotation ADR-0008 describes, modelled here so that the use case and API suites rely on it.
// What is fixed is the provider's contract, not the bookkeeping of this file: a token is used once,
// an access token expires on its own, and a reuse outside the interval ends the session.
describe('inMemoryIdentityProvider session rotation', () => {
    const HEURE_MS = 60 * 60 * 1000;
    const APRES_L_INTERVALLE_MS = 11_000;

    it('returns a different refresh token on every exchange', async () => {
        const p = provider();
        const session = await p.authenticate(ADRESSE, ANCIEN);

        const renouvelee = await p.refresh(session?.refreshToken ?? '');

        expect(renouvelee?.refreshToken).toBeDefined();
        expect(renouvelee?.refreshToken).not.toBe(session?.refreshToken);
    });

    it('lets the refresh token outlive the expiry of the access token', async () => {
        let instant = 1_000_000;
        const p = provider(() => instant);
        const session = await p.authenticate(ADRESSE, ANCIEN);

        instant += HEURE_MS + 1;

        await expect(p.identify(session?.accessToken ?? '')).resolves.toBeUndefined();
        await expect(p.refresh(session?.refreshToken ?? '')).resolves.toBeDefined();
    });

    it('returns the same session to a replay within the reuse interval', async () => {
        let instant = 1_000_000;
        const p = provider(() => instant);
        const session = await p.authenticate(ADRESSE, ANCIEN);

        const premier = await p.refresh(session?.refreshToken ?? '');
        instant += 9_000;
        const second = await p.refresh(session?.refreshToken ?? '');

        expect(second?.accessToken).toBe(premier?.accessToken);
        expect(second?.refreshToken).toBe(premier?.refreshToken);
    });

    it('ends the session and revokes its tokens on a reuse outside the interval', async () => {
        let instant = 1_000_000;
        const p = provider(() => instant);
        const session = await p.authenticate(ADRESSE, ANCIEN);
        const renouvelee = await p.refresh(session?.refreshToken ?? '');

        instant += APRES_L_INTERVALLE_MS;
        const reutilisation = await p.refresh(session?.refreshToken ?? '');

        expect(reutilisation).toBeUndefined();
        await expect(p.identify(renouvelee?.accessToken ?? '')).resolves.toBeUndefined();
        await expect(p.refresh(renouvelee?.refreshToken ?? '')).resolves.toBeUndefined();
    });

    it('rejects a refresh token it never issued', async () => {
        const p = provider();

        await expect(p.refresh('refresh:account-1:999')).resolves.toBeUndefined();
    });
});

// Changing credentials while signed in (US-36), modelled for the use case and API suites. What is
// fixed: a password change keeps the current session and revokes the others, and an address change
// only takes effect once the token is confirmed.
describe('inMemoryIdentityProvider credential change', () => {
    const AUTRE = 'AutreMotDePasse3';
    const NEUVE = 'neuf@example.com';

    async function sessionDe(
        p: ReturnType<typeof provider>,
        email = ADRESSE,
        password = ANCIEN,
    ): Promise<{ accessToken: string; refreshToken: string }> {
        const session = await p.authenticate(email, password);
        if (session === undefined) throw new Error('authentification attendue');
        return session;
    }

    it('keeps the session that changes the password and revokes the others', async () => {
        const p = provider();
        const courante = await sessionDe(p);
        const autre = await sessionDe(p);

        await p.changePassword(courante.accessToken, courante.refreshToken, NOUVEAU);

        await expect(p.identify(courante.accessToken)).resolves.toBeDefined();
        await expect(p.identify(autre.accessToken)).resolves.toBeUndefined();
        await expect(p.refresh(autre.refreshToken)).resolves.toBeUndefined();
    });

    it('applies the new password', async () => {
        const p = provider();
        const session = await sessionDe(p);

        await p.changePassword(session.accessToken, session.refreshToken, NOUVEAU);

        await expect(p.authenticate(ADRESSE, NOUVEAU)).resolves.toBeDefined();
        await expect(p.authenticate(ADRESSE, ANCIEN)).resolves.toBeUndefined();
    });

    it('only changes the address once the token is confirmed', async () => {
        const p = provider();
        const session = await sessionDe(p);

        await expect(
            p.changeEmail(session.accessToken, session.refreshToken, NEUVE),
        ).resolves.toBe('confirmation-requested');
        // The old address remains the identifier as long as nothing is confirmed.
        await expect(p.authenticate(ADRESSE, ANCIEN)).resolves.toBeDefined();

        await p.confirmEmailChange(p.emailChangeTokenFor(ADRESSE) ?? '');

        await expect(p.authenticate(NEUVE, ANCIEN)).resolves.toBeDefined();
        await expect(p.authenticate(ADRESSE, ANCIEN)).resolves.toBeUndefined();
    });

    it('answers identically for an address already taken', async () => {
        const p = inMemoryIdentityProvider([
            { id: 'account-1', email: ADRESSE, password: ANCIEN },
            { id: 'account-2', email: 'bob@example.com', password: AUTRE },
        ]);
        const session = await sessionDe(p);

        await expect(
            p.changeEmail(session.accessToken, session.refreshToken, 'bob@example.com'),
        ).resolves.toBe('address-unavailable');
    });

    it('rejects an unknown confirmation token', async () => {
        const p = provider();

        await expect(p.confirmEmailChange('jamais-emis')).resolves.toBe('token-rejected');
    });
});
