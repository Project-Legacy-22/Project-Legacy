import { describe, expect, it, vi } from 'vitest';

import { inMemoryCompromisedPasswords } from '../../test/fakes/in-memory-compromised-passwords.js';
import { inMemoryIdentityProvider } from '../../test/fakes/in-memory-identity-provider.js';
import { CompromisedPassword, IncorrectCurrentPassword, WeakPassword } from '../domain/account.js';
import type { IdentityProvider } from '../ports/identity-provider.js';
import type { AuthenticatedCaller } from './authenticated-caller.js';
import { makeChangePassword } from './change-password.js';
import { makeSignIn } from './sign-in.js';

const ADRESSE = 'alice@example.com';
const ANCIEN = 'AncienMotDePasse1';
const NOUVEAU = 'NouveauMotDePasse2';

async function callerOf(provider: IdentityProvider): Promise<AuthenticatedCaller> {
    const session = await provider.authenticate(ADRESSE, ANCIEN);

    return {
        account: session?.account ?? { id: 'account-1', email: ADRESSE },
        accessToken: session?.accessToken ?? '',
        refreshToken: session?.refreshToken ?? '',
    };
}

async function contexte(options: { compromised?: string[] } = {}) {
    const provider = inMemoryIdentityProvider([{ id: 'account-1', email: ADRESSE, password: ANCIEN }]);

    return {
        provider,
        caller: await callerOf(provider),
        changePassword: makeChangePassword({
            provider,
            compromisedPasswords: inMemoryCompromisedPasswords(options.compromised),
        }),
        signIn: makeSignIn(provider),
    };
}

describe('changePassword', () => {
    it('change le mot de passe quand l actuel et la politique sont bons', async () => {
        const { caller, changePassword, signIn } = await contexte();

        await changePassword(caller, ANCIEN, NOUVEAU);

        await expect(signIn(ADRESSE, NOUVEAU)).resolves.toBeDefined();
        await expect(signIn(ADRESSE, ANCIEN)).rejects.toThrow();
    });

    it('refuse un mot de passe actuel faux sans rien changer', async () => {
        const { provider, caller, changePassword, signIn } = await contexte();
        const spy = vi.spyOn(provider, 'changePassword');

        await expect(changePassword(caller, 'PasLeBon9A', NOUVEAU)).rejects.toBeInstanceOf(
            IncorrectCurrentPassword,
        );
        expect(spy).not.toHaveBeenCalled();
        await expect(signIn(ADRESSE, ANCIEN)).resolves.toBeDefined();
    });

    it('refuse un nouveau mot de passe trop court sans appeler le fournisseur', async () => {
        const { provider, caller, changePassword } = await contexte();
        const spy = vi.spyOn(provider, 'changePassword');

        await expect(changePassword(caller, ANCIEN, 'Court1')).rejects.toBeInstanceOf(WeakPassword);
        expect(spy).not.toHaveBeenCalled();
    });

    it('refuse un nouveau mot de passe compromis sans appeler le fournisseur', async () => {
        const { provider, caller, changePassword } = await contexte({ compromised: [NOUVEAU] });
        const spy = vi.spyOn(provider, 'changePassword');

        await expect(changePassword(caller, ANCIEN, NOUVEAU)).rejects.toBeInstanceOf(CompromisedPassword);
        expect(spy).not.toHaveBeenCalled();
    });

    it('traduit un refus de politique du fournisseur en mot de passe faible', async () => {
        const provider = inMemoryIdentityProvider([
            { id: 'account-1', email: ADRESSE, password: ANCIEN },
        ]);
        const caller = await callerOf(provider);
        const changePassword = makeChangePassword({
            provider: { ...provider, changePassword: () => Promise.resolve('weak-password') },
            compromisedPasswords: inMemoryCompromisedPasswords(),
        });

        await expect(changePassword(caller, ANCIEN, NOUVEAU)).rejects.toBeInstanceOf(WeakPassword);
    });

    it('ne laisse pas le nouveau mot de passe dans le message d erreur', async () => {
        const provider = inMemoryIdentityProvider([
            { id: 'account-1', email: ADRESSE, password: ANCIEN },
        ]);
        const caller = await callerOf(provider);
        const changePassword = makeChangePassword({
            provider,
            compromisedPasswords: inMemoryCompromisedPasswords([NOUVEAU]),
        });

        const erreur = await changePassword(caller, ANCIEN, NOUVEAU).catch((error: unknown) => error);

        expect((erreur as Error).message).not.toContain(NOUVEAU);
    });
});
