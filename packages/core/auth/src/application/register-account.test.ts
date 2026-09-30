import { describe, expect, it } from 'vitest';

import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';

import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { InvalidEmailAddress, WeakPassword } from '../domain/account.js';
import { makeRegisterAccount } from './register-account.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const MOT_DE_PASSE = 'MotDePasse2026';

describe('registerAccount', () => {
    it('creates an account that can then be used to sign in', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await registerAccount(ADRESSE, MOT_DE_PASSE, PRIVACY_POLICY_VERSION);
        const session = await signIn(ADRESSE, MOT_DE_PASSE);

        expect(session.account.email).toBe(ADRESSE);
    });

    // The central criterion of US-11: creating an account must not reveal whether an address is
    // already taken. Both calls must therefore be indistinguishable from the caller's point of
    // view.
    it('answers the same way for a free address and an address already taken', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);

        const premiere = await registerAccount(ADRESSE, MOT_DE_PASSE, PRIVACY_POLICY_VERSION);
        const seconde = await registerAccount(ADRESSE, 'AutreMotDePasse7', PRIVACY_POLICY_VERSION);

        expect(seconde).toEqual(premiere);
    });

    it('does not replace the password of an existing account', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await registerAccount(ADRESSE, MOT_DE_PASSE, PRIVACY_POLICY_VERSION);
        await registerAccount(ADRESSE, 'AutreMotDePasse7', PRIVACY_POLICY_VERSION);

        await expect(signIn(ADRESSE, 'AutreMotDePasse7')).rejects.toThrow();
        await expect(signIn(ADRESSE, MOT_DE_PASSE)).resolves.toBeDefined();
    });

    it('stores the address in its canonical form', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await registerAccount('  Alice@Example.COM ', MOT_DE_PASSE, PRIVACY_POLICY_VERSION);

        await expect(signIn(ADRESSE, MOT_DE_PASSE)).resolves.toBeDefined();
    });

    it('refuses a password that is too weak without creating anything', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);
        const signIn = makeSignIn(provider);

        await expect(registerAccount(ADRESSE, 'court1A', PRIVACY_POLICY_VERSION)).rejects.toBeInstanceOf(WeakPassword);
        await expect(signIn(ADRESSE, 'court1A')).rejects.toThrow();
    });

    it('refuses an invalid address without creating anything', async () => {
        const provider = inMemoryIdentityProvider();
        const registerAccount = makeRegisterAccount(provider);

        await expect(registerAccount('pas-une-adresse', MOT_DE_PASSE, PRIVACY_POLICY_VERSION)).rejects.toBeInstanceOf(
            InvalidEmailAddress,
        );
    });
});
