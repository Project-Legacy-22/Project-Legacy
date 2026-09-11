import type {
    EmailChangeConfirmation,
    EmailChangeOutcome,
    IdentityProvider,
    PasswordChangeOutcome,
    PasswordResetOutcome,
    RegistrationOutcome,
    Session,
} from '../../src/index.js';

interface StoredAccount {
    id: string;
    email: string;
    password: string;
    // The session ids currently accepted for this account. Revoking every
    // session clears it; a signed-in password change keeps one and drops the
    // rest. A token carries its session id, so a dropped one stops resolving.
    liveSessions: Set<number>;
    recovery?: { token: string; expiresAt: number };
    // A pending email change: the address is not swapped until the token is
    // confirmed, so the current email stays the login identifier meanwhile.
    emailChange?: { token: string; newEmail: string };
}

// A real, in-process implementation of the port rather than a mock: it accepts
// registrations, refuses duplicates, checks passwords, hands out tokens it can
// recognise afterwards, rotates a refresh token the way ADR-0008 describes,
// runs a single-use time-limited reset flow, and models a signed-in credential
// change (US-36). A test using it exercises the same contract the Supabase
// adapter honours, and keeps working across a refactor.
//
// Access tokens are "token:<id>:<session>:<expiresAt>" and refresh tokens are
// "refresh:<id>:<session>:<n>". A test that asserted on those strings would be
// asserting on the fake, so none does; they round-trip a value through
// identify() or refresh(), and read the out-of-band tokens through
// recoveryTokenFor() and emailChangeTokenFor().
//
// The expiry travels inside the access token so that a test moving the injected
// clock past it sees what a browser holding a one-hour JWT sees: the token
// stops being accepted while the refresh token it came with still works.
export interface InMemoryIdentityProvider extends IdentityProvider {
    // Test seam: the reset email is out of reach here, so a test reads the
    // token the fake would have put in it.
    recoveryTokenFor(email: string): string | undefined;
    // Test seam: same, for the email-change confirmation link.
    emailChangeTokenFor(email: string): string | undefined;
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
    sessionId: number;
    used?: { at: number; successor: Session };
}

export function inMemoryIdentityProvider(
    seed: SeededAccount[] = [],
    options: { now?: () => number } = {},
): InMemoryIdentityProvider {
    const now = options.now ?? Date.now;
    const accounts = new Map<string, StoredAccount>(
        seed.map(account => [account.email, { ...account, liveSessions: new Set<number>() }]),
    );
    const refreshTokens = new Map<string, StoredRefreshToken>();
    // What each registration consented to, so a test can assert on it.
    const consentedVersions = new Map<string, string>();
    let nextId = seed.length;
    let nextToken = 0;
    let nextSessionId = 0;

    function accountById(accountId: string | undefined): StoredAccount | undefined {
        return [...accounts.values()].find(account => account.id === accountId);
    }

    // Mints the token pair for a session, whether it is a brand new one or the
    // successor of a rotation: the caller decides the session id, which stays
    // the same across a rotation because it is the same session.
    function mintSession(account: StoredAccount, sessionId: number): Session {
        nextToken += 1;
        const refreshToken = `refresh:${account.id}:${String(sessionId)}:${String(nextToken)}`;
        refreshTokens.set(refreshToken, { accountId: account.id, sessionId });

        const expiresAt = now() + ACCESS_TOKEN_TTL_MS;

        return {
            account: { id: account.id, email: account.email },
            accessToken: `token:${account.id}:${String(sessionId)}:${String(expiresAt)}`,
            refreshToken,
            expiresInSeconds: ACCESS_TOKEN_TTL_MS / 1000,
        };
    }

    function openSession(account: StoredAccount): Session {
        nextSessionId += 1;
        account.liveSessions.add(nextSessionId);
        return mintSession(account, nextSessionId);
    }

    function sessionIdOf(accessToken: string): { accountId: string; sessionId: number } | undefined {
        const [prefix, accountId, sessionId] = accessToken.split(':');
        if (prefix !== 'token' || accountId === undefined || sessionId === undefined) return undefined;

        return { accountId, sessionId: Number(sessionId) };
    }

    function accountByCurrentToken(accessToken: string): StoredAccount | undefined {
        const [prefix, accountId, sessionId, expiresAt] = accessToken.split(':');
        if (prefix !== 'token') return undefined;

        const account = accountById(accountId);
        if (account === undefined || !account.liveSessions.has(Number(sessionId))) return undefined;

        return Number(expiresAt) > now() ? account : undefined;
    }

    function dropRefreshTokens(accountId: string, keep?: (sessionId: number) => boolean): void {
        for (const [token, stored] of refreshTokens) {
            if (stored.accountId !== accountId) continue;
            if (keep === undefined || !keep(stored.sessionId)) refreshTokens.delete(token);
        }
    }

    // Ends every session of the account: no token already handed out matches a
    // live session id any more, and the refresh tokens are dropped outright so
    // a later exchange finds nothing rather than something stale.
    function revokeAllSessions(account: StoredAccount): void {
        account.liveSessions.clear();
        dropRefreshTokens(account.id);
    }

    // Ends every session but the one the caller is holding: what a signed-in
    // password change does (US-36).
    function revokeOtherSessions(account: StoredAccount, keepSessionId: number): void {
        account.liveSessions = new Set(account.liveSessions.has(keepSessionId) ? [keepSessionId] : []);
        dropRefreshTokens(account.id, sessionId => sessionId === keepSessionId);
    }

    function accountByRecoveryToken(token: string): StoredAccount | undefined {
        return [...accounts.values()].find(({ recovery }) => {
            if (recovery === undefined) return false;
            return recovery.token === token && recovery.expiresAt > now();
        });
    }

    return {
        register: (email, password, policyVersion): Promise<RegistrationOutcome> => {
            if (accounts.has(email)) return Promise.resolve('already-registered');
            consentedVersions.set(email, policyVersion);

            nextId += 1;
            accounts.set(email, {
                id: `account-${String(nextId)}`,
                email,
                password,
                liveSessions: new Set<number>(),
            });
            return Promise.resolve('created');
        },

        authenticate: (email, password): Promise<Session | undefined> => {
            const account = accounts.get(email);
            const matches = account !== undefined && account.password === password;

            return Promise.resolve(matches ? openSession(account) : undefined);
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
            if (!account.liveSessions.has(stored.sessionId)) return Promise.resolve(undefined);

            if (stored.used === undefined) {
                const successor = mintSession(account, stored.sessionId);
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

            // The token is in two places at once: end this one session.
            account.liveSessions.delete(stored.sessionId);
            dropRefreshTokens(account.id, sessionId => sessionId !== stored.sessionId);
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

        // Revokes just this session, the way GoTrue's 'local' scope does: a
        // token that does not match a live session is already at signOut's
        // goal state, so there is nothing to do.
        signOut: (accessToken): Promise<void> => {
            const identified = sessionIdOf(accessToken);
            const account = accountById(identified?.accountId);

            if (identified !== undefined && account !== undefined) {
                account.liveSessions.delete(identified.sessionId);
                dropRefreshTokens(account.id, sessionId => sessionId !== identified.sessionId);
            }
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
            revokeAllSessions(account);
            return Promise.resolve('password-changed');
        },

        changePassword: (accessToken, _refreshToken, newPassword): Promise<PasswordChangeOutcome> => {
            const identified = sessionIdOf(accessToken);
            const account = accountByCurrentToken(accessToken);

            // requireAccount has already vouched for this token, so a miss here
            // is a test wiring its own bad token; treat it as the goal state.
            if (identified !== undefined && account !== undefined) {
                account.password = newPassword;
                revokeOtherSessions(account, identified.sessionId);
            }
            return Promise.resolve('password-changed');
        },

        changeEmail: (accessToken, _refreshToken, newEmail): Promise<EmailChangeOutcome> => {
            const account = accountByCurrentToken(accessToken);

            if (accounts.has(newEmail)) return Promise.resolve('address-unavailable');
            if (account === undefined) return Promise.resolve('confirmation-requested');

            nextToken += 1;
            account.emailChange = { token: `email-change:${account.id}:${String(nextToken)}`, newEmail };
            return Promise.resolve('confirmation-requested');
        },

        confirmEmailChange: (token): Promise<EmailChangeConfirmation> => {
            const account = [...accounts.values()].find(
                candidate => candidate.emailChange?.token === token,
            );

            if (account?.emailChange === undefined) return Promise.resolve('token-rejected');

            const { newEmail } = account.emailChange;
            accounts.delete(account.email);
            account.email = newEmail;
            accounts.set(newEmail, account);
            delete account.emailChange;
            return Promise.resolve('confirmed');
        },

        recoveryTokenFor: (email): string | undefined => accounts.get(email)?.recovery?.token,
        emailChangeTokenFor: (email): string | undefined => accounts.get(email)?.emailChange?.token,
    };
}
