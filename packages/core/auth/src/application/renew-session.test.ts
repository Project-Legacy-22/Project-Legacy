import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { makeIdentifyCaller } from './identify-caller.js';
import { makeRenewSession } from './renew-session.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const HEURE_MS = 60 * 60 * 1000;
// The provider's reuse interval is ten seconds (supabase/config.toml). Beyond it, a token already
// exchanged is a token circulating in two places.
const APRES_L_INTERVALLE_MS = 11_000;
const COMPTE = { id: 'account-1', email: ADRESSE };

function provider(now?: () => number) {
    return inMemoryIdentityProvider(
        [{ id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE }],
        now === undefined ? {} : { now },
    );
}

describe('renewSession', () => {
    it('returns a usable session when the access token has expired', async () => {
        let instant = 1_000_000;
        const fournisseur = provider(() => instant);
        const ouverte = await makeSignIn(fournisseur)(ADRESSE, MOT_DE_PASSE);

        instant += HEURE_MS + 1;
        const renouvelee = await makeRenewSession(fournisseur)(ouverte.refreshToken);

        expect(renouvelee?.account).toEqual(COMPTE);
        await expect(
            makeIdentifyCaller(fournisseur)(renouvelee?.accessToken ?? ''),
        ).resolves.toEqual(COMPTE);
    });

    it('renews nothing behind a token nobody issued', async () => {
        const renouvelee = await makeRenewSession(provider())('jeton-invente');

        expect(renouvelee).toBeUndefined();
    });

    // The criterion of issue #28: the rotation described by ADR-0008 is checked, not assumed. A
    // token already exchanged that comes back after the reuse interval is a token circulating in
    // two places; the session ends and what it had opened stops being valid.
    it('ends the session and revokes its tokens when an exchanged token comes back too late', async () => {
        let instant = 1_000_000;
        const fournisseur = provider(() => instant);
        const renewSession = makeRenewSession(fournisseur);
        const ouverte = await makeSignIn(fournisseur)(ADRESSE, MOT_DE_PASSE);
        const renouvelee = await renewSession(ouverte.refreshToken);

        instant += APRES_L_INTERVALLE_MS;
        const reutilisation = await renewSession(ouverte.refreshToken);

        expect(reutilisation).toBeUndefined();
        await expect(
            makeIdentifyCaller(fournisseur)(renouvelee?.accessToken ?? ''),
        ).resolves.toBeUndefined();
        await expect(renewSession(renouvelee?.refreshToken ?? '')).resolves.toBeUndefined();
    });

    // Two requests sent together present the same token. Refusing both, or one of them, would turn
    // ordinary concurrency into a sign-out.
    it('serves two concurrent exchanges of the same token with the same session', async () => {
        const fournisseur = provider();
        const renewSession = makeRenewSession(fournisseur);
        const ouverte = await makeSignIn(fournisseur)(ADRESSE, MOT_DE_PASSE);

        const [premiere, seconde] = await Promise.all([
            renewSession(ouverte.refreshToken),
            renewSession(ouverte.refreshToken),
        ]);

        expect(seconde?.accessToken).toBe(premiere?.accessToken);
        expect(seconde?.refreshToken).toBe(premiere?.refreshToken);
    });
});
