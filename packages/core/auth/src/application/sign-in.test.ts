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
    it('opens a session carrying the identity of the account', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const session = await signIn(ADRESSE, MOT_DE_PASSE);

        expect(session.account).toEqual({ id: 'account-1', email: ADRESSE });
        expect(session.accessToken).toEqual(expect.any(String));
    });

    it('accepts an address typed with a different case', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const session = await signIn('  ALICE@Example.com ', MOT_DE_PASSE);

        expect(session.account.email).toBe(ADRESSE);
    });

    // The same refusal in both cases: telling them apart would publish the list of registered
    // addresses.
    it('refuses a wrong password and an unknown address indistinguishably', async () => {
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

    // The refusal covers more than a wrong password: an address whose confirmation was never
    // followed is refused too, and the adapter makes them indistinguishable. The message must
    // therefore not claim that the password is wrong -- that sent this person to reset a password
    // that works -- and must name a way out.
    it('does not claim to know which of the two halves is wrong', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const refus = await signIn(ADRESSE, 'MauvaisMotDePasse1').catch((error: unknown) => error);
        const message = (refus as Error).message;

        expect(message).not.toMatch(/is incorrect/iu);
        expect(message).toMatch(/reset your password/iu);
    });

    it('never returns the password in the session', async () => {
        const signIn = makeSignIn(providerAvecCompte());

        const session = await signIn(ADRESSE, MOT_DE_PASSE);

        expect(JSON.stringify(session)).not.toContain(MOT_DE_PASSE);
    });
});
