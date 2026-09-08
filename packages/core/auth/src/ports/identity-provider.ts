import type { Account } from '../domain/account.js';

// A session as the application needs it. The refresh token is deliberately
// absent: renewing and revoking a session is US-27, and holding a secret the
// code has no use for yet is a liability, not a head start.
export interface Session {
    account: Account;
    accessToken: string;
    expiresInSeconds: number;
}

// The port reports what actually happened. Answering the same way in both cases
// is a decision, and decisions belong to the use case, not to the adapter.
export type RegistrationOutcome = 'created' | 'already-registered';

// What authentication requires of the outside world, named after the need and
// not after the technology. packages/infra provides the Supabase Auth
// implementation (ADR-0008); this interface is what makes replacing it a matter
// of writing another adapter.
export interface IdentityProvider {
    register(email: string, password: string): Promise<RegistrationOutcome>;
    authenticate(email: string, password: string): Promise<Session | undefined>;
    identify(accessToken: string): Promise<Account | undefined>;

    // Removes the credentials and every session they opened, which is what
    // signs the person out of every browser rather than only the one that
    // asked. Erasure (US-13) is its only caller: this application has no
    // administrative deletion, and adding one would need its own story.
    //
    // Deleting an account that is already gone succeeds, for the same reason
    // PersonalDataStore.eraseFor tolerates a second call: a retry must be able
    // to finish what a failed attempt started.
    remove(accountId: string): Promise<void>;
}
