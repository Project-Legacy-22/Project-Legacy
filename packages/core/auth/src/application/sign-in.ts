import { InvalidCredentials } from '../domain/account.js';
import { normalizeEmailAddress } from '../domain/email-address.js';
import type { IdentityProvider, Session } from '../ports/identity-provider.js';

// The address is normalised, not validated: an address that no longer passes
// today's rules may still be the one an account was created with, and a
// dedicated refusal for it would be one more way to tell registered addresses
// apart from unregistered ones.
export function makeSignIn(provider: IdentityProvider) {
    return async function signIn(email: string, password: string): Promise<Session> {
        const session = await provider.authenticate(normalizeEmailAddress(email), password);

        if (session === undefined) {
            throw new InvalidCredentials();
        }

        return session;
    };
}
