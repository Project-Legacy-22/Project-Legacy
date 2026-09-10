import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { InvalidCredentials } from '../domain/account.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

function providerAvecCompte() {
    return inMemoryIdentityProvider([
        { id: 'account-1', email: ADRESSE, password: MOT_DE_PASSE },
    ]);
}

describe('signIn', () => {
    it('ouvre une session portant l identite du compte', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const session = await signIn(ADRESSE, MOT_DE_PASSE);

        expect(session.account).toEqual({ id: 'account-1', email: ADRESSE });
        expect(session.accessToken).toEqual(expect.any(String));
    });

    it('accepte une adresse saisie avec une casse differente', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const session = await signIn('  ALICE@Example.com ', MOT_DE_PASSE);

        expect(session.account.email).toBe(ADRESSE);
    });

    // Le meme refus dans les deux cas : distinguer les deux reviendrait a
    // publier la liste des adresses inscrites.
    it('refuse un mot de passe faux et une adresse inconnue de facon indiscernable', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const motDePasseFaux = await signIn(ADRESSE, 'MauvaisMotDePasse1').catch(
            (error: unknown) => error,
        );
        const adresseInconnue = await signIn('bob@example.com', MOT_DE_PASSE).catch(
            (error: unknown) => error,
        );

        expect(motDePasseFaux).toBeInstanceOf(InvalidCredentials);
        expect(adresseInconnue).toBeInstanceOf(InvalidCredentials);
        expect((motDePasseFaux as Error).message).toBe((adresseInconnue as Error).message);
    });

    it('ne renvoie jamais le mot de passe dans la session', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const session = await signIn(ADRESSE, MOT_DE_PASSE);

        expect(JSON.stringify(session)).not.toContain(MOT_DE_PASSE);
    });
});
