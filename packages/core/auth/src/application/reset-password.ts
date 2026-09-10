import { CompromisedPassword, InvalidResetToken, WeakPassword } from '../domain/account.js';
import { checkedPassword } from '../domain/password-policy.js';
import type { CompromisedPasswordRegistry } from '../ports/compromised-password-registry.js';
import type { IdentityProvider } from '../ports/identity-provider.js';

// Completes a forgotten-password reset: check the new password, then hand the
// token and the password to the provider, which swaps the password and revokes
// every other session of the account.
//
// The password is vetted before the token is spent. A doomed password must not
// burn a single-use link: the user can follow the same link again with a
// better one. The domain policy runs first because it needs no network; the
// breach check second because it does.
export function makeResetPassword(deps: {
    provider: IdentityProvider;
    compromisedPasswords: CompromisedPasswordRegistry;
}) {
    return async function resetPassword(token: string, password: string): Promise<void> {
        checkedPassword(password);

        if (await deps.compromisedPasswords.isCompromised(password)) {
            throw new CompromisedPassword();
        }

        const outcome = await deps.provider.resetPassword(token, password);

        if (outcome === 'token-rejected') {
            throw new InvalidResetToken();
        }
        if (outcome === 'weak-password') {
            throw new WeakPassword('was rejected by the identity provider.');
        }
    };
}
