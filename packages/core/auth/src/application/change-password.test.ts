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
    it('changes the password when the current one and the policy are right', async () => {
        const { caller, changePassword, signIn } = await contexte();

        await changePassword(caller, ANCIEN, NOUVEAU);

        await expect(signIn(ADRESSE, NOUVEAU)).resolves.toBeDefined();
        await expect(signIn(ADRESSE, ANCIEN)).rejects.toThrow();
    });

    it('refuses a wrong current password without changing anything', async () => {
        const { provider, caller, changePassword, signIn } = await contexte();
        const spy = vi.spyOn(provider, 'changePassword');

        await expect(changePassword(caller, 'PasLeBon9A', NOUVEAU)).rejects.toBeInstanceOf(
            IncorrectCurrentPassword,
        );
        expect(spy).not.toHaveBeenCalled();
        await expect(signIn(ADRESSE, ANCIEN)).resolves.toBeDefined();
    });

    it('refuses a new password that is too short without calling the provider', async () => {
        const { provider, caller, changePassword } = await contexte();
        const spy = vi.spyOn(provider, 'changePassword');

        await expect(changePassword(caller, ANCIEN, 'Court1')).rejects.toBeInstanceOf(WeakPassword);
        expect(spy).not.toHaveBeenCalled();
    });

    it('refuses a compromised new password without calling the provider', async () => {
        const { provider, caller, changePassword } = await contexte({ compromised: [NOUVEAU] });
        const spy = vi.spyOn(provider, 'changePassword');

        await expect(changePassword(caller, ANCIEN, NOUVEAU)).rejects.toBeInstanceOf(CompromisedPassword);
        expect(spy).not.toHaveBeenCalled();
    });

    it('translates a policy refusal from the provider into a weak password', async () => {
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

    it('keeps the new password out of the error message', async () => {
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
