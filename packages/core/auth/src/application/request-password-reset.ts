import { normalizeEmailAddress } from '../domain/email-address.js';
import type { IdentityProvider } from '../ports/identity-provider.js';

// Asks the identity provider to send a reset link, and says nothing back.
//
// The address is normalised, not validated: the same reasoning as sign-in. A
// stricter rule here would be one more way to tell a registered address from an
// unregistered one, and the provider already answers both cases alike. Whatever
// the outcome, the caller learns only that the request was accepted.
export function makeRequestPasswordReset(provider: IdentityProvider) {
    return async function requestPasswordReset(email: string): Promise<void> {
        await provider.requestPasswordReset(normalizeEmailAddress(email));
    };
}
