import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { makeIdentifyCaller } from './identify-caller.js';
import { makeRenewSession } from './renew-session.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';
const HEURE_MS = 60 * 60 * 1000;
// L intervalle de reprise du fournisseur est de dix secondes
// (supabase/config.toml). Au-dela, un jeton deja echange est un jeton qui
// circule en deux endroits.
const APRES_L_INTERVALLE_MS = 11_000;
const COMPTE = { id: 'account-1', email: ADRESSE };

function provider(now?: () => number) {
    return inMemoryIdentityProvider(
        [{ id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE }],
        now === undefined ? {} : { now },
    );
}

describe('renewSession', () => {
    it('rend une session utilisable quand le jeton d acces a expire', async () => {
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

    it('ne renouvelle rien derriere un jeton que personne n a emis', async () => {
        const renouvelee = await makeRenewSession(provider())('jeton-invente');

        expect(renouvelee).toBeUndefined();
    });

    // Le critere de l issue #28 : la rotation decrite par l ADR-0008 est
    // verifiee, pas supposee. Un jeton deja echange qui revient apres
    // l intervalle de reprise est un jeton qui circule en deux endroits ; la
    // session se termine et ce qu elle avait ouvert cesse de valoir.
    it('termine la session et revoque ses jetons quand un jeton deja echange revient trop tard', async () => {
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

    // Deux requetes parties ensemble presentent le meme jeton. Les refuser
    // toutes les deux, ou en refuser une, ferait de la concurrence ordinaire
    // une deconnexion.
    it('sert deux echanges concurrents du meme jeton avec la meme session', async () => {
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
