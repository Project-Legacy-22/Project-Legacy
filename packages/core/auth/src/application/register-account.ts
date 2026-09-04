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
    return async function registerAccount(email: string, password: string): Promise<void> {
        await provider.register(emailAddress(email), checkedPassword(password));
    };
}
