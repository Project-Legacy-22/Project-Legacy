import { InvalidEmailChangeToken } from '../domain/account.js';
import type { IdentityProvider } from '../ports/identity-provider.js';

// Completes an email change by exchanging the token from the confirmation link
// (US-36). The provider swaps the address of record; where it is configured to
// confirm on both sides, this runs once per link.
//
// No session is required: the link may be opened in a browser that never held
// one, and the token is the authorization. An unknown, spent or expired token
// all become one refusal, like reset-password.ts.
export function makeConfirmEmailChange(provider: IdentityProvider) {
    return async function confirmEmailChange(token: string): Promise<void> {
        const outcome = await provider.confirmEmailChange(token);

        if (outcome === 'token-rejected') throw new InvalidEmailChangeToken();
    };
}
