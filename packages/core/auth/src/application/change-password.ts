import { CompromisedPassword, IncorrectCurrentPassword, WeakPassword } from '../domain/account.js';
import { checkedPassword } from '../domain/password-policy.js';
import type { CompromisedPasswordRegistry } from '../ports/compromised-password-registry.js';
import type { IdentityProvider } from '../ports/identity-provider.js';
import type { AuthenticatedCaller } from './authenticated-caller.js';

// Changes the password of a signed-in account (US-36). The current password is
// proven first -- a wrong one gets nothing else done -- then the new one is
// held to the same policy and breach check as a reset (US-28), and only then
// does the provider set it and revoke the account's other sessions, keeping
// this one.
//
// The order mirrors reset-password.ts: the domain policy runs before the breach
// check because it needs no network, and both run before the provider is asked
// to change anything. A doomed password must not revoke a single session.
export function makeChangePassword(deps: {
    provider: IdentityProvider;
    compromisedPasswords: CompromisedPasswordRegistry;
}) {
    return async function changePassword(
        caller: AuthenticatedCaller,
        currentPassword: string,
        newPassword: string,
    ): Promise<void> {
        const proven = await deps.provider.authenticate(caller.account.email, currentPassword);
        if (proven === undefined) throw new IncorrectCurrentPassword();

        checkedPassword(newPassword);

        if (await deps.compromisedPasswords.isCompromised(newPassword)) {
            throw new CompromisedPassword();
        }

        const outcome = await deps.provider.changePassword(
            caller.accessToken,
            caller.refreshToken,
            newPassword,
        );

        if (outcome === 'weak-password') {
            throw new WeakPassword('was rejected by the identity provider.');
        }
    };
}
