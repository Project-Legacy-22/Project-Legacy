import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ServiceUnavailable } from '@legacy/contracts';
import type { Unavailability } from '@legacy/contracts';

import type { Database } from './database.types.js';

// What every adapter in this package was writing for itself.
//
// Seven of them carried the same fail(), differing only in the label, and five
// built the same service-role client with the same two options. Copies like
// these do not stay identical: one of them gains a retry, or loses
// persistSession, and nothing says the others did not.

// A technical failure of one adapter, reported with the operation that failed
// and the cause underneath.
//
// A factory rather than a function taking the label at every call: the label
// belongs to the adapter, not to the call site, and repeating it on every throw
// is how the seven copies started.
//
// The type is named and every caller annotates its const with it, which looks
// redundant next to the inference and is not: TypeScript only lets a call
// narrow the code after it -- treating the lines below as unreachable -- when
// the callee is a function declaration or a const with an explicit type. The
// seven copies were declarations, so they got that for free; a const assigned
// from a factory does not.
export type AdapterFailure = (operation: string, cause: unknown) => never;

// A dependency that throttled us, did not answer in time, or could not be
// reached is not a fault of ours, and saying 500 for it read as one: the
// production log of 23 September shows a GoTrue rate limit answered as an
// internal error (#383). Those causes become a ServiceUnavailable, which the
// HTTP layer answers with 503 and a delay. Everything else stays a plain
// failure, reported as 500: an error nobody modelled must not be dressed up as
// a passing outage.
export function adapterFailure(adapter: string): AdapterFailure {
    return (operation, cause) => {
        const reason = unavailabilityOf(cause);
        if (reason !== undefined) {
            throw new ServiceUnavailable(reason, `${adapter}: ${operation}`, { cause });
        }
        throw new Error(`${adapter}: ${operation} failed`, { cause });
    };
}

// What each client says when the service behind it is the problem.
//
// GoTrue answers a throttle with 429 and `over_request_rate_limit`, and the SDK
// raises AuthRetryableFetchError when the host did not answer at all. PostgREST
// reports a failed fetch as `TypeError: fetch failed` with an empty code, and
// its own PGRST000 to PGRST002 when it cannot reach the database behind it;
// 57014 is the statement timeout of that database. The Redis client does not
// name its errors, so its connection failures are known by their class.
const STATUS_REASONS: ReadonlyMap<unknown, Unavailability> = new Map([
    [429, 'rate_limited'],
    [502, 'unreachable'],
    [503, 'unreachable'],
    [504, 'unreachable'],
]);
const CODE_REASONS: ReadonlyMap<unknown, Unavailability> = new Map([
    ['over_request_rate_limit', 'rate_limited'],
    ['57014', 'timed_out'],
    ['PGRST000', 'unreachable'],
    ['PGRST001', 'unreachable'],
    ['PGRST002', 'unreachable'],
]);
const UNREACHABLE_NAMES = new Set([
    'AuthRetryableFetchError',
    'ClientClosedError',
    'ClientOfflineError',
    'ConnectionTimeoutError',
    'SocketClosedUnexpectedlyError',
    'SocketTimeoutError',
]);

function fieldOf(value: object, name: string): unknown {
    return (value as Record<string, unknown>)[name];
}

function byName(cause: object): Unavailability | undefined {
    const named = UNREACHABLE_NAMES.has(cause.constructor.name) || UNREACHABLE_NAMES.has(String(fieldOf(cause, 'name')));
    return named ? 'unreachable' : undefined;
}

function byFailedFetch(cause: object): Unavailability | undefined {
    const message = fieldOf(cause, 'message');
    const failed = fieldOf(cause, 'code') === '' && typeof message === 'string' && message.startsWith('TypeError: fetch failed');
    return failed ? 'unreachable' : undefined;
}

function unavailabilityOf(cause: unknown): Unavailability | undefined {
    if (cause instanceof DeadlineExceeded) return 'timed_out';
    if (typeof cause !== 'object' || cause === null) return undefined;

    return (
        STATUS_REASONS.get(fieldOf(cause, 'status')) ??
        CODE_REASONS.get(fieldOf(cause, 'code')) ??
        byName(cause) ??
        byFailedFetch(cause)
    );
}

export interface SupabaseSettings {
    url: string;
    serviceRoleKey: string;
}

// The client the outbound adapters use. The service-role key bypasses row-level
// security, which is the point: authorization is decided by the use case that
// called, and the adapter only carries out what was already allowed.
//
// persistSession and autoRefreshToken are off because there is no session to
// keep: each call authenticates with the key, and a background refresh timer in
// a server process would only be a timer nobody stops.
export function serviceRoleClient(settings: SupabaseSettings): SupabaseClient<Database> {
    return createClient<Database>(settings.url, settings.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

// PostgreSQL renders a timestamptz with a numeric offset (`+00:00`), while
// the contracts' canonical form ends in `Z`. Both denote the same instant, and
// `z.iso.datetime()` accepts only the second: read straight through, a row we
// wrote ourselves is rejected by our own schema.
//
// Written here rather than in one adapter because it was in one adapter. The
// outbox carried a private copy, the notification store never got it, and the
// notification list came back refused by the browser with the count beside it
// correct (#344). A rule about how this database renders dates belongs with
// the client that reads it, once.
//
// The raw value is returned when it cannot be parsed, instead of letting
// toISOString throw a RangeError: a row that cannot be read must be refused by
// the schema, which names the row, rather than by an exception nobody catches.
export function asInstant(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

// Its own class so that adapterFailure can tell a call that ran out of time
// from one that failed: the first is a 503 worth retrying, the second is not.
export class DeadlineExceeded extends Error {
    constructor(operation: string, milliseconds: number) {
        super(`${operation} exceeded its ${milliseconds} ms deadline`);
        this.name = 'DeadlineExceeded';
    }
}

// A deadline for a call whose own retries cannot be bounded: the SDK retries a
// failed refresh for about 25 seconds and exposes no way to shorten it (#214).
export async function withDeadline<T>(
    work: Promise<T>,
    milliseconds: number,
    operation: string,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DeadlineExceeded(operation, milliseconds)), milliseconds);
    });

    try {
        return await Promise.race([work, deadline]);
    } finally {
        // Without this, the timer holds the process open for its whole duration
        // even when the work answered first -- which in a long-running process
        // means a pending timer per renewal.
        if (timer !== undefined) clearTimeout(timer);
    }
}

// GoTrue answers Gateway Timeout when the hosted instance has been idle: one
// measured at 5.1 s on a sign-in. signInWithPassword does not retry -- only
// _refreshAccessToken carries the SDK's retryable() wrapper -- so that single
// timeout became a 500 and the person was told their password was wrong.
//
// Retried once, and only for the errors the SDK itself classes as retryable: a
// refused password is an answer, not an outage, and retrying it would double
// the cost of every wrong attempt.
const RETRYABLE = 'AuthRetryableFetchError';
const RETRY_PAUSE_MS = 250;

export async function retryingOnOutage<T extends { error: { name?: string } | null }>(
    call: () => Promise<T>,
): Promise<T> {
    const first = await call();
    if (first.error === null || first.error.name !== RETRYABLE) return first;

    await new Promise(resolve => setTimeout(resolve, RETRY_PAUSE_MS));

    return call();
}
