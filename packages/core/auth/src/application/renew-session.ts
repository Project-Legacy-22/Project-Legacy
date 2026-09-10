import type { IdentityProvider, Session } from '../ports/identity-provider.js';

// The counterpart of identifyCaller: the HTTP layer asks the application to
// extend the session it holds, instead of holding a provider client and
// deciding for itself what a refused exchange means.
//
// A refusal is not an error here either. It is an ordinary answer, "this
// session is over", and turning it into a response is the caller's decision --
// the caller being the middleware that knows whether the request it is serving
// had anything else to fall back on.
export function makeRenewSession(provider: IdentityProvider) {
    return async function renewSession(refreshToken: string): Promise<Session | undefined> {
        return provider.refresh(refreshToken);
    };
}
