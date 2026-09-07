import { describe, expect, it, vi } from 'vitest';

import { inMemoryCompromisedPasswords } from '../../test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { CompromisedPassword, InvalidResetToken, WeakPassword } from '../domain/account.js';
import type { IdentityProvider, PasswordResetOutcome } from '../ports/identity-provider.js';
import { makeSignIn } from './sign-in.js';
import { makeRequestPasswordReset } from './request-password-reset.js';
import { makeResetPassword } from './reset-password.js';

const ADRESSE = 'alice@example.com';
const ANCIEN = 'AncienMotDePasse1';
const NOUVEAU = 'NouveauMotDePasse2';

function contexte(options: { compromised?: string[] } = {}) {
    const provider = inMemoryIdentityProvider([{ id: 'account-1', email: ADRESSE, password: ANCIEN }]);
    const compromisedPasswords = inMemoryCompromisedPasswords(options.compromised);
    return {
        provider,
        requestPasswordReset: makeRequestPasswordReset(provider),
        resetPassword: makeResetPassword({ provider, compromisedPasswords }),
        signIn: makeSignIn(provider),
    };
}

function providerReturning(outcome: PasswordResetOutcome): IdentityProvider {
    const base = inMemoryIdentityProvider();
    return { ...base, resetPassword: () => Promise.resolve(outcome) };
}

describe('resetPassword', () => {
    it('change le mot de passe quand le jeton et la politique sont bons', async () => {
        const { provider, requestPasswordReset, resetPassword, signIn } = contexte();
        await requestPasswordReset(ADRESSE);
        const token = provider.recoveryTokenFor(ADRESSE) ?? '';

        await resetPassword(token, NOUVEAU);

        await expect(signIn(ADRESSE, NOUVEAU)).resolves.toBeDefined();
        await expect(signIn(ADRESSE, ANCIEN)).rejects.toThrow();
    });

    it('refuse un mot de passe trop court sans depenser le jeton', async () => {
        const { provider, requestPasswordReset, resetPassword } = contexte();
        await requestPasswordReset(ADRESSE);
        const token = provider.recoveryTokenFor(ADRESSE) ?? '';
        const spy = vi.spyOn(provider, 'resetPassword');

        await expect(resetPassword(token, 'Court1')).rejects.toBeInstanceOf(WeakPassword);
        expect(spy).not.toHaveBeenCalled();
        // Le meme lien reste utilisable avec un meilleur mot de passe.
        await expect(resetPassword(token, NOUVEAU)).resolves.toBeUndefined();
    });

    it('refuse un mot de passe compromis sans depenser le jeton', async () => {
        const { provider, requestPasswordReset, resetPassword } = contexte({ compromised: [NOUVEAU] });
        await requestPasswordReset(ADRESSE);
        const token = provider.recoveryTokenFor(ADRESSE) ?? '';
        const spy = vi.spyOn(provider, 'resetPassword');

        await expect(resetPassword(token, NOUVEAU)).rejects.toBeInstanceOf(CompromisedPassword);
        expect(spy).not.toHaveBeenCalled();
    });

    it('traduit un jeton rejete en lien invalide', async () => {
        const resetPassword = makeResetPassword({
            provider: providerReturning('token-rejected'),
            compromisedPasswords: inMemoryCompromisedPasswords(),
        });

        await expect(resetPassword('jeton-perime', NOUVEAU)).rejects.toBeInstanceOf(InvalidResetToken);
    });

    it('traduit un refus de politique du fournisseur en mot de passe faible', async () => {
        const resetPassword = makeResetPassword({
            provider: providerReturning('weak-password'),
            compromisedPasswords: inMemoryCompromisedPasswords(),
        });

        await expect(resetPassword('jeton', NOUVEAU)).rejects.toBeInstanceOf(WeakPassword);
    });

    it('ne laisse ni le jeton ni le mot de passe dans le message d erreur', async () => {
        const resetPassword = makeResetPassword({
            provider: providerReturning('token-rejected'),
            compromisedPasswords: inMemoryCompromisedPasswords(),
        });

        const erreur = await resetPassword('jeton-secret', NOUVEAU).catch((error: unknown) => error);

        expect((erreur as Error).message).not.toContain('jeton-secret');
        expect((erreur as Error).message).not.toContain(NOUVEAU);
    });
});
