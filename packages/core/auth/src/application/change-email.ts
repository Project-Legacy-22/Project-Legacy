import { emailAddress } from '../domain/email-address.js';
import type { IdentityProvider } from '../ports/identity-provider.js';
import type { AuthenticatedCaller } from './authenticated-caller.js';

// Starts a change of the caller's own email address (US-36). The provider
// emails a confirmation link to the new address; the old address stays the
// login identifier until that link is followed.
//
// The outcome is read and dropped, like makeRegisterAccount's:
// 'address-unavailable' has to answer exactly like 'confirmation-requested', or
// the form becomes a way to tell which addresses already have an account here.
export function makeChangeEmail(provider: IdentityProvider) {
    return async function changeEmail(
        caller: AuthenticatedCaller,
        newEmail: string,
    ): Promise<void> {
        await provider.changeEmail(caller.accessToken, caller.refreshToken, emailAddress(newEmail));
    };
}
