import { createClient } from '@supabase/supabase-js';

import type { Account, IdentityProvider, RegistrationOutcome, Session } from '@legacy/core-auth';

export interface SupabaseAuthSettings {
    url: string;
    anonKey: string;
    // Deleting an account is the one operation of this port that no session can
    // perform on its own behalf: GoTrue exposes it on the admin API only. It is
    // held in a second client below rather than raising the privilege of the
    // one that signs people in.
    serviceRoleKey: string;
}

// GoTrue answers a well-formed request in one of a few known ways. These three
// codes are ordinary answers; anything else is a failure of ours and has to
// reach the error middleware as a 500 rather than be mistaken for a rejected
// credential. Silently treating an unknown error as "wrong password" would turn
// an outage into a wall of plausible refusals.
const ALREADY_REGISTERED = 'user_already_exists';
const INVALID_CREDENTIALS = 'invalid_credentials';
const UNUSABLE_TOKEN = new Set(['bad_jwt', 'session_expired', 'session_not_found']);
// Deleting an account that is already gone. The erasure use case may be a retry
// of an attempt that failed after removing the rows, and a retry has to be able
// to finish rather than report a failure for work already done.
const USER_NOT_FOUND = 404;

// The cause is attached rather than interpolated: the provider's message can
// carry the address that was submitted, and this error is going to be logged.
function fail(operation: string, cause: unknown): never {
    throw new Error(`identity provider: ${operation} failed`, { cause });
}

function accountOf(user: { id: string; email?: string | undefined }): Account {
    if (user.email === undefined) fail('identify', new Error('the provider returned no address'));

    return { id: user.id, email: user.email };
}

// The Supabase Auth adapter (ADR-0008). It uses the anon key, not the
// service-role key: sign-up and sign-in are the endpoints that apply the
// project's password policy and the provider's own rate limits, and the admin
// API bypasses both.
export function createSupabaseIdentityProvider(settings: SupabaseAuthSettings): IdentityProvider {
    const client = createClient(settings.url, settings.anonKey, {
        // The API is stateless: it holds no session of its own, and the caller's
        // token arrives with each request. Persisting or refreshing anything
        // here would mean one shared session for every user of the process.
        auth: { persistSession: false, autoRefreshToken: false },
    });
    // The admin client, used by one method. Kept apart from the one above so
    // that sign-up and sign-in cannot reach the service-role key by accident:
    // the endpoints that apply the password policy and the provider's rate
    // limits are exactly the endpoints that key would bypass.
    const admin = createClient(settings.url, settings.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    async function register(email: string, password: string): Promise<RegistrationOutcome> {
        // Email confirmation is disabled, so a successful sign-up also returns a
        // session. It is discarded: registering does not log anybody in, and the
        // response must not differ from the one an existing address produces.
        const { error } = await client.auth.signUp({ email, password });

        if (error === null) return 'created';
        if (error.code === ALREADY_REGISTERED) return 'already-registered';

        return fail('register', error);
    }

    async function authenticate(email: string, password: string): Promise<Session | undefined> {
        const result = await client.auth.signInWithPassword({ email, password });

        if (result.error !== null) {
            if (result.error.code === INVALID_CREDENTIALS) return undefined;
            return fail('authenticate', result.error);
        }

        return {
            account: accountOf(result.data.user),
            accessToken: result.data.session.access_token,
            expiresInSeconds: result.data.session.expires_in,
        };
    }

    async function identify(accessToken: string): Promise<Account | undefined> {
        const result = await client.auth.getUser(accessToken);

        if (result.error !== null) {
            const code = result.error.code;
            if (code !== undefined && UNUSABLE_TOKEN.has(code)) return undefined;
            if (result.error.status === 401 || result.error.status === 403) return undefined;

            return fail('identify', result.error);
        }

        return accountOf(result.data.user);
    }

    async function remove(accountId: string): Promise<void> {
        // No second argument: deleteUser soft-deletes only when asked to, and a
        // soft delete would keep the row, the address and the credentials that
        // an erasure exists to remove. Deleting the user also drops the
        // sessions and refresh tokens GoTrue holds for it, which is what signs
        // the person out everywhere instead of only in the browser that asked.
        const { error } = await admin.auth.admin.deleteUser(accountId);

        if (error === null || error.status === USER_NOT_FOUND) return;

        return fail('remove', error);
    }

    return { register, authenticate, identify, remove };
}
