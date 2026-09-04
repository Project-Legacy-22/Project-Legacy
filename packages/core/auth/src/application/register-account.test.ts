import { describe, expect, it } from 'vitest';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { InvalidEmailAddress, WeakPassword } from '../domain/account.js';
import { makeRegisterAccount } from './register-account.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

describe('registerAccount', () => {
    it('cree un compte utilisable ensuite pour se connecter', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await registerAccount(ADRESSE, MOT_DE_PASSE);
        const session = await signIn(ADRESSE, MOT_DE_PASSE);

        expect(session.account.email).toBe(ADRESSE);
    });

    // Le critere central de US-11 : la creation de compte ne doit pas permettre
    // de savoir si une adresse est deja prise. Les deux appels doivent donc etre
    // indiscernables du point de vue de l appelant.
    it('repond de la meme facon sur une adresse libre et sur une adresse deja prise', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);

        const premiere = await registerAccount(ADRESSE, MOT_DE_PASSE);
        const seconde = await registerAccount(ADRESSE, 'AutreMotDePasse7');

        expect(seconde).toEqual(premiere);
    });

    it('ne remplace pas le mot de passe d un compte existant', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await registerAccount(ADRESSE, MOT_DE_PASSE);
        await registerAccount(ADRESSE, 'AutreMotDePasse7');

        await expect(signIn(ADRESSE, 'AutreMotDePasse7')).rejects.toThrow();
        await expect(signIn(ADRESSE, MOT_DE_PASSE)).resolves.toBeDefined();
    });

    it('enregistre l adresse sous sa forme canonique', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await registerAccount('  Alice@Example.COM ', MOT_DE_PASSE);

        await expect(signIn(ADRESSE, MOT_DE_PASSE)).resolves.toBeDefined();
    });

    it('refuse un mot de passe trop faible sans rien creer', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await expect(registerAccount(ADRESSE, 'court1A')).rejects.toBeInstanceOf(WeakPassword);
        await expect(signIn(ADRESSE, 'court1A')).rejects.toThrow();
    });

    it('refuse une adresse invalide sans rien creer', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);

        await expect(registerAccount('pas-une-adresse', MOT_DE_PASSE)).rejects.toBeInstanceOf(
            InvalidEmailAddress,
        );
    });
});
