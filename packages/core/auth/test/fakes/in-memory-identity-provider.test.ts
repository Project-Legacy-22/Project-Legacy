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

// La rotation que decrit l ADR-0008, modelisee ici pour que les suites de cas
// d usage et d API s appuient dessus. Ce qui est fixe est le contrat du
// fournisseur, pas la comptabilite de ce fichier : un jeton ne sert qu une
// fois, un jeton d acces expire seul, et une reutilisation hors intervalle
// termine la session.
describe('inMemoryIdentityProvider session rotation', () => {
    const HEURE_MS = 60 * 60 * 1000;
    const APRES_L_INTERVALLE_MS = 11_000;

    it('rend un jeton de rafraichissement different a chaque echange', async () => {
        const p = provider();
        const session = await p.authenticate(ADRESSE, ANCIEN);

        const renouvelee = await p.refresh(session?.refreshToken ?? '');

        expect(renouvelee?.refreshToken).toBeDefined();
        expect(renouvelee?.refreshToken).not.toBe(session?.refreshToken);
    });

    it('laisse le jeton de rafraichissement survivre a l expiration du jeton d acces', async () => {
        let instant = 1_000_000;
        const p = provider(() => instant);
        const session = await p.authenticate(ADRESSE, ANCIEN);

        instant += HEURE_MS + 1;

        await expect(p.identify(session?.accessToken ?? '')).resolves.toBeUndefined();
        await expect(p.refresh(session?.refreshToken ?? '')).resolves.toBeDefined();
    });

    it('rend la meme session a un rejeu dans l intervalle de reprise', async () => {
        let instant = 1_000_000;
        const p = provider(() => instant);
        const session = await p.authenticate(ADRESSE, ANCIEN);

        const premier = await p.refresh(session?.refreshToken ?? '');
        instant += 9_000;
        const second = await p.refresh(session?.refreshToken ?? '');

        expect(second?.accessToken).toBe(premier?.accessToken);
        expect(second?.refreshToken).toBe(premier?.refreshToken);
    });

    it('termine la session et revoque ses jetons sur une reutilisation hors intervalle', async () => {
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

    it('rejette un jeton de rafraichissement qu il n a jamais emis', async () => {
        const p = provider();

        await expect(p.refresh('refresh:account-1:999')).resolves.toBeUndefined();
    });
});
