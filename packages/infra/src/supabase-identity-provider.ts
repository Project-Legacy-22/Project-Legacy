import { createClient } from '@supabase/supabase-js';
import type { Session as GoTrueSession } from '@supabase/supabase-js';

import type {
    Account,
    IdentityProvider,
    PasswordResetOutcome,
    RegistrationOutcome,
    Session,
} from '@legacy/core-auth';
import { adapterFailure, withDeadline } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

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

// A refresh token GoTrue will not exchange. It distinguishes a token it never
// issued from one already spent and from a session it has ended; we do not,
// because the three mean the same thing to the person holding the cookie, and
// saying which would describe a session to whoever presented the token.
//
// `refresh_token_already_used` is the answer to a reuse outside the reuse
// interval: GoTrue has ended the session and revoked its tokens by the time it
// replies (ADR-0008). Nothing more is asked of it here.
const UNUSABLE_REFRESH_TOKEN = new Set([
    'refresh_token_not_found',
    'refresh_token_already_used',
    'session_expired',
    'session_not_found',
    'bad_jwt',
]);
// Deleting an account that is already gone. The erasure use case may be a retry
// of an attempt that failed after removing the rows, and a retry has to be able
// to finish rather than report a failure for work already done.
const USER_NOT_FOUND = 404;

// The recovery link was already used, has expired, or never existed. All of
// them mean the same thing to the caller: ask for a new link.
const RECOVERY_REJECTED = new Set([
    'otp_expired',
    'otp_disabled',
    'bad_jwt',
    'session_not_found',
    'flow_state_not_found',
    'flow_state_expired',
    'validation_failed',
]);
const WEAK_PASSWORD = 'weak_password';

// GoTrue's own throttle on recovery emails. With the local mail catcher it is
// inert, but in production it must not surface as a 500: the caller has just
// been told a link is on its way, and asking again should look identical.
const EMAIL_RATE_LIMITED = 'over_email_send_rate_limit';

// The cause is attached rather than interpolated: the provider's message can
// carry the address that was submitted, and this error is going to be logged.
const fail: AdapterFailure = adapterFailure('identity provider');

function accountOf(user: { id: string; email?: string | undefined }): Account {
    if (user.email === undefined) fail('identify', new Error('the provider returned no address'));

    return { id: user.id, email: user.email };
}

// One translation for both ways a session is obtained, signing in and renewing,
// so the two cannot drift apart on which field carries what.
function sessionOf(session: GoTrueSession): Session {
    return {
        account: accountOf(session.user),
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresInSeconds: session.expires_in,
    };
}

// A client that keeps no state: the API holds no session of its own, and the
// caller's token arrives with each request. Persisting or refreshing anything
// here would mean one shared session for every user of the process.
function stateless(settings: SupabaseAuthSettings) {
    return createClient(settings.url, settings.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

// The admin client, used by the two operations no session can perform on its
// own behalf. Kept apart from the one above so that sign-up and sign-in
// cannot reach the service-role key by accident: the endpoints that apply the
// password policy and the provider's own rate limits are exactly the
// endpoints that key would bypass.
function admin(settings: SupabaseAuthSettings) {
    return createClient(settings.url, settings.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

async function signOut(settings: SupabaseAuthSettings, accessToken: string): Promise<void> {
    // 'local' revokes only the refresh token tied to this access token, not
    // every session of the account -- that is resetPassword's job, with its
    // own reason to want 'global'.
    const { error } = await admin(settings).auth.admin.signOut(accessToken, 'local');

    if (error === null) return;
    if (error.code !== undefined && UNUSABLE_TOKEN.has(error.code)) return;
    if (error.status === 401 || error.status === 403) return;

    return fail('signOut', error);
}

async function requestPasswordReset(settings: SupabaseAuthSettings, email: string): Promise<void> {
    // GoTrue answers a syntactically valid address the same way whether or not
    // it has an account, so this call does not disclose which. The recovery
    // link is built from the site URL configured in supabase/config.toml, so
    // nothing about routing enters this code.
    const { error } = await stateless(settings).auth.resetPasswordForEmail(email);

    if (error === null) return;
    if (error.code === EMAIL_RATE_LIMITED) return;

    return fail('requestPasswordReset', error);
}

// Far short of the 25 seconds the SDK's own retries take to give up (#214).
const REFRESH_DEADLINE_MS = 5000;

async function refresh(
    settings: SupabaseAuthSettings,
    refreshToken: string,
): Promise<Session | undefined> {
    // A throwaway client, for the reason resetPassword below uses one: the
    // exchange stores the session it obtains on the instance that ran it, and
    // that session belongs to a single caller.
    let result;
    try {
        result = await withDeadline(
            stateless(settings).auth.refreshSession({ refresh_token: refreshToken }),
            REFRESH_DEADLINE_MS,
            'refresh',
        );
    } catch (cause) {
        return fail('refresh', cause);
    }

    if (result.error !== null) {
        const { code, status } = result.error;
        if (code !== undefined && UNUSABLE_REFRESH_TOKEN.has(code)) return undefined;
        // A GoTrue old enough to answer without an error code still says 400 or
        // 401 for a grant it refuses. Anything else is ours to report: an
        // outage must not read as an expired session, or a database that came
        // back a minute later would have signed out every caller meanwhile.
        if (status === 400 || status === 401) return undefined;

        return fail('refresh', result.error);
    }

    // A refusal carrying no error is not a shape GoTrue documents, but the type
    // allows it, and inventing a session here would be worse than ending one
    // that may still be live.
    return result.data.session === null ? undefined : sessionOf(result.data.session);
}

async function resetPassword(
    settings: SupabaseAuthSettings,
    recoveryToken: string,
    newPassword: string,
): Promise<PasswordResetOutcome> {
    // A throwaway client: verifyOtp puts the recovered session on the instance
    // it runs on, and this exchange must not share that state with any other
    // caller of the process.
    const scoped = stateless(settings);

    const verified = await scoped.auth.verifyOtp({ type: 'recovery', token_hash: recoveryToken });
    if (verified.error !== null) {
        const { code, status } = verified.error;
        if (code !== undefined && RECOVERY_REJECTED.has(code)) return 'token-rejected';
        if (status === 401 || status === 403) return 'token-rejected';
        return fail('resetPassword', verified.error);
    }

    const updated = await scoped.auth.updateUser({ password: newPassword });
    if (updated.error !== null) {
        if (updated.error.code === WEAK_PASSWORD) return 'weak-password';
        return fail('resetPassword', updated.error);
    }

    // Global scope revokes every refresh token of the account, including the one
    // just minted by verifyOtp. GoTrue swallows 401/403/404 here on its own;
    // anything left is a real failure, and we must not report success when we
    // cannot confirm the revocation (US-28 criterion 3).
    const signedOut = await scoped.auth.signOut({ scope: 'global' });
    if (signedOut.error !== null) return fail('resetPassword', signedOut.error);

    return 'password-changed';
}

// The Supabase Auth adapter (ADR-0008). It uses the anon key, not the
// service-role key: sign-up and sign-in are the endpoints that apply the
// project's password policy and the provider's own rate limits, and the admin
// API bypasses both.
interface Registration {
    email: string;
    password: string;
    policyVersion: string;
}

async function registerWith(
    client: ReturnType<typeof stateless>,
    { email, password, policyVersion }: Registration,
): Promise<RegistrationOutcome> {
    // Email confirmation is disabled, so a successful sign-up also returns a
    // session. It is discarded: registering does not log anybody in, and the
    // response must not differ from the one an existing address produces.
    // The consent rides along as user metadata, so the mirror trigger reads
    // it in the transaction that creates the account. Written by a second
    // call afterwards, it could be missing from an account that exists.
    const { error } = await client.auth.signUp({
        email,
        password,
        options: { data: { policy_version: policyVersion } },
    });

    if (error === null) return 'created';
    if (error.code === ALREADY_REGISTERED) return 'already-registered';

    return fail('register', error);
}

export function createSupabaseIdentityProvider(settings: SupabaseAuthSettings): IdentityProvider {
    const client = stateless(settings);
    const adminClient = admin(settings);

    const register = (email: string, password: string, policyVersion: string) =>
        registerWith(client, { email, password, policyVersion });


    async function authenticate(email: string, password: string): Promise<Session | undefined> {
        const result = await client.auth.signInWithPassword({ email, password });

        if (result.error !== null) {
            if (result.error.code === INVALID_CREDENTIALS) return undefined;
            return fail('authenticate', result.error);
        }

        return sessionOf(result.data.session);
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
        const { error } = await adminClient.auth.admin.deleteUser(accountId);

        if (error === null || error.status === USER_NOT_FOUND) return;

        return fail('remove', error);
    }

    return {
        register,
        authenticate,
        identify,
        remove,
        refresh: refreshToken => refresh(settings, refreshToken),
        requestPasswordReset: email => requestPasswordReset(settings, email),
        resetPassword: (token, password) => resetPassword(settings, token, password),
        signOut: accessToken => signOut(settings, accessToken),
    };
}
