import type { Account } from '../domain/account.js';
import type { IdentityProvider } from '../ports/identity-provider.js';

// The seam between an incoming request and the identity behind it. It exists so
// that the HTTP layer asks the application "who is this", instead of holding a
// provider client and deciding for itself what a valid token looks like.
//
// An unusable token is not an error here: it is an ordinary answer, "nobody".
// Turning it into a refusal is the caller's decision, and the caller is the
// middleware that knows the request needs a session.
export function makeIdentifyCaller(provider: IdentityProvider) {
    return async function identifyCaller(accessToken: string): Promise<Account | undefined> {
        return provider.identify(accessToken);
    };
}
