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
}
