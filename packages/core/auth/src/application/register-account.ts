import { emailAddress } from '../domain/email-address.js';
import { checkedPassword } from '../domain/password-policy.js';
import type { IdentityProvider } from '../ports/identity-provider.js';

// Creating an account answers the same way whether the address was free or
// already taken, and never hands back a session.
//
// Both halves of that matter. A form that answers "already registered" tells
// anyone which addresses have an account here; one that logs the caller
// straight in says the same thing by the shape of its response. The outcome
// reported by the port is therefore read and dropped on purpose: the port stays
// honest about what happened, and hiding it is this use case's job.
export function makeRegisterAccount(provider: IdentityProvider) {
    return async function registerAccount(
        email: string,
        password: string,
        policyVersion: string,
    ): Promise<void> {
        // The version is carried through untouched. Which version is current,
        // and whether the one offered matches it, is decided at the boundary
        // where the published text is known; the use case only makes sure it
        // reaches the account.
        await provider.register(emailAddress(email), checkedPassword(password), policyVersion);
    };
}
