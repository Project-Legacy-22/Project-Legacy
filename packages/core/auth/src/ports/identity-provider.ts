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

// What authentication requires of the outside world, named after the need and
// not after the technology. packages/infra provides the Supabase Auth
// implementation (ADR-0008); this interface is what makes replacing it a matter
// of writing another adapter.
export interface IdentityProvider {
    register(email: string, password: string): Promise<RegistrationOutcome>;
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
}
