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
// recognise afterwards, rotates a refresh token the way ADR-0008 describes, and
// runs a single-use, time-limited reset flow. A test using it exercises the
// same contract the Supabase adapter honours, and keeps working across a
// refactor.
//
// Access tokens are "token:<id>:<epoch>:<expiresAt>" and refresh tokens are
// "refresh:<id>:<n>". A test that asserted on those strings would be asserting
// on the fake, so none does; they round-trip a value through identify() or
// refresh(), and read a reset token through recoveryTokenFor().
//
// The expiry travels inside the access token so that a test moving the injected
// clock past it sees what a browser holding a one-hour JWT sees: the token
// stops being accepted while the refresh token it came with still works.
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

// The same hour supabase/config.toml gives a JWT.
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

// refresh_token_reuse_interval in supabase/config.toml. A second exchange of
// the same token inside this window is a retry of one request and gets the same
// session back; after it, the token is in two places at once and the session
// ends (ADR-0008).
const REFRESH_REUSE_INTERVAL_MS = 10 * 1000;

// A refresh token, and what became of it. `used` is set by the exchange that
// consumed it and holds the session that exchange produced, so a replay inside
// the reuse interval can be answered with that same session.
interface StoredRefreshToken {
    accountId: string;
    epoch: number;
    used?: { at: number; successor: Session };
}

export function inMemoryIdentityProvider(
    seed: SeededAccount[] = [],
    options: { now?: () => number } = {},
): InMemoryIdentityProvider {
    const now = options.now ?? Date.now;
    const accounts = new Map<string, StoredAccount>(
        seed.map(account => [account.email, { ...account, sessionEpoch: 0 }]),
    );
    const refreshTokens = new Map<string, StoredRefreshToken>();
    let nextId = seed.length;
    let nextToken = 0;

    function accountById(accountId: string | undefined): StoredAccount | undefined {
        return [...accounts.values()].find(account => account.id === accountId);
    }

    function sessionFor(account: StoredAccount): Session {
        nextToken += 1;
        const refreshToken = `refresh:${account.id}:${String(nextToken)}`;
        refreshTokens.set(refreshToken, { accountId: account.id, epoch: account.sessionEpoch });

        const expiresAt = now() + ACCESS_TOKEN_TTL_MS;

        return {
            account: { id: account.id, email: account.email },
            accessToken: `token:${account.id}:${String(account.sessionEpoch)}:${String(expiresAt)}`,
            refreshToken,
            expiresInSeconds: ACCESS_TOKEN_TTL_MS / 1000,
        };
    }

    function accountByCurrentToken(accessToken: string): StoredAccount | undefined {
        const [prefix, accountId, epoch, expiresAt] = accessToken.split(':');
        if (prefix !== 'token') return undefined;

        const account = accountById(accountId);
        if (account === undefined || String(account.sessionEpoch) !== epoch) return undefined;

        return Number(expiresAt) > now() ? account : undefined;
    }

    // Ends every session of the account: the epoch no longer matches any token
    // already handed out, and the refresh tokens are dropped outright so a
    // later exchange finds nothing rather than something stale.
    function revokeSessions(account: StoredAccount): void {
        account.sessionEpoch += 1;

        for (const [token, stored] of refreshTokens) {
            if (stored.accountId === account.id) refreshTokens.delete(token);
        }
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

        refresh: (refreshToken): Promise<Session | undefined> => {
            const stored = refreshTokens.get(refreshToken);
            const account = accountById(stored?.accountId);

            if (stored === undefined || account === undefined) return Promise.resolve(undefined);
            if (stored.epoch !== account.sessionEpoch) return Promise.resolve(undefined);

            if (stored.used === undefined) {
                const successor = sessionFor(account);
                stored.used = { at: now(), successor };

                return Promise.resolve(successor);
            }

            // A replay inside the reuse interval is one request the network
            // sent twice. Answering it with the session the first exchange
            // produced is what keeps two concurrent calls from ending a
            // perfectly healthy session.
            if (now() - stored.used.at <= REFRESH_REUSE_INTERVAL_MS) {
                return Promise.resolve(stored.used.successor);
            }

            revokeSessions(account);
            return Promise.resolve(undefined);
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
            revokeSessions(account);
            return Promise.resolve('password-changed');
        },

        recoveryTokenFor: (email): string | undefined => accounts.get(email)?.recovery?.token,
    };
}
