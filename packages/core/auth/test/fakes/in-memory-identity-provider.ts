import type {
    IdentityProvider,
    PasswordResetOutcome,
    RegistrationOutcome,
    Session,
} from '../../src/index.js';

interface StoredAccount {
    id: string;
    email: string;
    password: string;
    // Bumped whenever every session of the account is revoked. A token carries
    // the epoch it was minted under, so a stale one stops being recognised.
    sessionEpoch: number;
    recovery?: { token: string; expiresAt: number };
}

// A real, in-process implementation of the port rather than a mock: it accepts
// registrations, refuses duplicates, checks passwords, hands out tokens it can
// recognise afterwards, and runs a single-use, time-limited reset flow. A test
// using it exercises the same contract the Supabase adapter honours, and keeps
// working across a refactor.
//
// Tokens are "token:<id>:<epoch>". A test that asserts on that string would be
// asserting on the fake, so no test does; they round-trip the value through
// identify(), and read a reset token through recoveryTokenFor().
export interface InMemoryIdentityProvider extends IdentityProvider {
    // Test seam: the reset email is out of reach here, so a test reads the
    // token the fake would have put in it.
    recoveryTokenFor(email: string): string | undefined;
}

interface SeededAccount {
    id: string;
    email: string;
    password: string;
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function inMemoryIdentityProvider(
    seed: SeededAccount[] = [],
    options: { now?: () => number } = {},
): InMemoryIdentityProvider {
    const now = options.now ?? Date.now;
    const accounts = new Map<string, StoredAccount>(
        seed.map(account => [account.email, { ...account, sessionEpoch: 0 }]),
    );
    let nextId = seed.length;
    let nextToken = 0;

    function sessionFor(account: StoredAccount): Session {
        return {
            account: { id: account.id, email: account.email },
            accessToken: `token:${account.id}:${String(account.sessionEpoch)}`,
            expiresInSeconds: 3600,
        };
    }

    function accountByCurrentToken(accessToken: string): StoredAccount | undefined {
        return [...accounts.values()].find(
            account => `token:${account.id}:${String(account.sessionEpoch)}` === accessToken,
        );
    }

    function accountByRecoveryToken(token: string): StoredAccount | undefined {
        return [...accounts.values()].find(({ recovery }) => {
            if (recovery === undefined) return false;
            return recovery.token === token && recovery.expiresAt > now();
        });
    }

    return {
        register: (email, password): Promise<RegistrationOutcome> => {
            if (accounts.has(email)) return Promise.resolve('already-registered');

            nextId += 1;
            accounts.set(email, {
                id: `account-${String(nextId)}`,
                email,
                password,
                sessionEpoch: 0,
            });
            return Promise.resolve('created');
        },

        authenticate: (email, password): Promise<Session | undefined> => {
            const account = accounts.get(email);
            const matches = account !== undefined && account.password === password;

            return Promise.resolve(matches ? sessionFor(account) : undefined);
        },

        identify: (accessToken): Promise<{ id: string; email: string } | undefined> => {
            const found = accountByCurrentToken(accessToken);

            return Promise.resolve(
                found === undefined ? undefined : { id: found.id, email: found.email },
            );
        },

        // Removing the account also removes the only thing identify() matches
        // on, so every token it had handed out stops resolving. That is the
        // behaviour the real provider has -- deleting a user drops its sessions
        // -- and it is what a test of US-13 asserts against.
        remove: (accountId): Promise<void> => {
            const found = [...accounts.values()].find(account => account.id === accountId);

            if (found !== undefined) accounts.delete(found.email);

            return Promise.resolve();
        },
        // The fake tracks one current token per account, not one per device,
        // so there is nothing narrower than the account's whole epoch to
        // revoke: the same bump resetPassword uses. A token that does not
        // match the current one is already unusable, which is signOut's goal
        // state, so there is nothing to do.
        signOut: (accessToken): Promise<void> => {
            const account = accountByCurrentToken(accessToken);
            if (account !== undefined) account.sessionEpoch += 1;
            return Promise.resolve();
        },

        requestPasswordReset: (email): Promise<void> => {
            const account = accounts.get(email);

            // No branch on existence beyond issuing the token: an unknown
            // address does the same amount of nothing a known one's bookkeeping
            // costs. A fresh request overwrites any pending token.
            if (account !== undefined) {
                nextToken += 1;
                account.recovery = {
                    token: `reset:${account.id}:${String(nextToken)}`,
                    expiresAt: now() + RESET_TOKEN_TTL_MS,
                };
            }

            return Promise.resolve();
        },

        resetPassword: (recoveryToken, newPassword): Promise<PasswordResetOutcome> => {
            const account = accountByRecoveryToken(recoveryToken);

            if (account === undefined) return Promise.resolve('token-rejected');

            account.password = newPassword;
            delete account.recovery;
            account.sessionEpoch += 1;
            return Promise.resolve('password-changed');
        },

        recoveryTokenFor: (email): string | undefined => accounts.get(email)?.recovery?.token,
    };
}
