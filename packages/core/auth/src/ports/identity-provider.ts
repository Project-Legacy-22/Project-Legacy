import type { Account } from '../domain/account.js';

// A session as the application needs it. The access token is short-lived; the
// refresh token is what lets the session outlive it, and it is single-use: the
// provider hands back a new one on every exchange (ADR-0008).
export interface Session {
    account: Account;
    accessToken: string;
    refreshToken: string;
    expiresInSeconds: number;
}

// The port reports what actually happened. Answering the same way in both cases
// is a decision, and decisions belong to the use case, not to the adapter.
export type RegistrationOutcome = 'created' | 'already-registered';

// What a reset attempt did. 'token-rejected' covers an unknown, consumed or
// expired token alike; 'weak-password' is the provider's own policy refusing
// the new password after the domain already accepted it. Turning either into a
// refusal, and keeping the wording indistinguishable, is the use case's job.
export type PasswordResetOutcome = 'password-changed' | 'token-rejected' | 'weak-password';

// What a signed-in password change did. 'weak-password' is the provider's own
// policy refusing the new password after the domain already accepted it; the
// current password is proven by the use case before this outcome is possible.
export type PasswordChangeOutcome = 'password-changed' | 'weak-password';

// What starting an email change did. 'address-unavailable' means the new
// address already has an account. The use case answers the two the same way:
// a form that said which is a way to tell which addresses are registered
// (US-36, same rule as RegistrationOutcome).
export type EmailChangeOutcome = 'confirmation-requested' | 'address-unavailable';

// What confirming an email change did. 'token-rejected' covers an unknown,
// spent or expired confirmation token alike.
export type EmailChangeConfirmation = 'confirmed' | 'token-rejected';

// What authentication requires of the outside world, named after the need and
// not after the technology. packages/infra provides the Supabase Auth
// implementation (ADR-0008); this interface is what makes replacing it a matter
// of writing another adapter.
export interface IdentityProvider {
    // The policy version travels with the registration so the adapter can hand
    // it to the account creation itself: recorded afterwards, a consent could
    // be missing from an account that exists.
    register(
        email: string,
        password: string,
        policyVersion: string,
    ): Promise<RegistrationOutcome>;
    authenticate(email: string, password: string): Promise<Session | undefined>;
    identify(accessToken: string): Promise<Account | undefined>;

    // Exchanges a refresh token for a fresh session and rotates it, so the
    // token handed back is never the one that was presented.
    //
    // Resolves to undefined when the exchange is refused. Consumed, revoked,
    // expired and unknown are not told apart: they all mean the session is
    // over, and reporting which would describe somebody's session to whoever
    // presented the token. Throws only when the provider itself fails.
    refresh(refreshToken: string): Promise<Session | undefined>;

    // Removes the credentials and every session they opened, which is what
    // signs the person out of every browser rather than only the one that
    // asked. Erasure (US-13) is its only caller: this application has no
    // administrative deletion, and adding one would need its own story.
    //
    // Deleting an account that is already gone succeeds, for the same reason
    // PersonalDataStore.eraseFor tolerates a second call: a retry must be able
    // to finish what a failed attempt started.
    remove(accountId: string): Promise<void>;

    // Starts a password reset for the address. Resolves the same way whether or
    // not it is registered: the provider does not disclose which, and the link
    // is built from the provider's own configured site URL, so no redirect
    // target enters the domain. Throws only when the provider itself fails.
    requestPasswordReset(email: string): Promise<void>;

    // Exchanges the token from the reset email, sets the new password, and
    // revokes every other session of the account. The token is single-use and
    // time-limited on the provider's side.
    resetPassword(recoveryToken: string, newPassword: string): Promise<PasswordResetOutcome>;

    // Revokes this one session's refresh token, so it cannot be exchanged for
    // a new access token again: signs the caller out of the browser that
    // asked, not every browser signed in as them (that is `remove`'s job, and
    // resetPassword's). A token the provider no longer recognises is treated
    // the same as one it just revoked -- the goal state, this token cannot be
    // renewed, is already reached.
    signOut(accessToken: string): Promise<void>;

    // Sets a new password for the account these tokens belong to and revokes
    // every OTHER session of it, keeping this one. The current password is not
    // this method's concern: the use case proves it with authenticate() first.
    // Both cookie tokens are needed because the change acts as the caller, not
    // as an administrator -- the same reason resetPassword acts through a
    // scoped session.
    changePassword(
        accessToken: string,
        refreshToken: string,
        newPassword: string,
    ): Promise<PasswordChangeOutcome>;

    // Starts an email change for the account these tokens belong to. The
    // provider emails a confirmation link to the new address (and, where it is
    // configured to, the current one); the address of record does not change
    // until the link is followed. Resolves the same way whether the new address
    // is free or already registered. Throws only when the provider itself fails.
    changeEmail(
        accessToken: string,
        refreshToken: string,
        newEmail: string,
    ): Promise<EmailChangeOutcome>;

    // Exchanges the token from an email-change confirmation link. Single-use and
    // time-limited on the provider's side. Unknown, spent and expired are not
    // told apart, for the same reason a reset token's states are not.
    confirmEmailChange(token: string): Promise<EmailChangeConfirmation>;
}
