import type { IdentityProvider } from '../ports/identity-provider.js';

// No token -- nobody had a session to begin with -- and a token the provider
// rejects both resolve the same way a revoked one does: this use case has one
// outcome, "you are signed out", which is exactly what lets the route answer
// identically whether or not a valid session backed the request.
export function makeSignOut(provider: IdentityProvider) {
    return async function signOut(accessToken: string | undefined): Promise<void> {
        if (accessToken === undefined) return;

        await provider.signOut(accessToken);
    };
}
