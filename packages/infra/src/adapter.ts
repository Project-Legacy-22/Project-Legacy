import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

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

export function adapterFailure(adapter: string): AdapterFailure {
    return (operation, cause) => {
        throw new Error(`${adapter}: ${operation} failed`, { cause });
    };
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

// A deadline for a call whose own retries cannot be bounded.
//
// @supabase/supabase-js retries a failed refresh with exponential backoff --
// 200, 400, 800 ms and so on -- for as long as the next interval still fits
// inside a 30-second window it keeps to itself. Measured on 2.115.0, that is
// eight attempts and about 25 seconds of sleeping, and neither the window nor
// the predicate is exposed. A session renewal against a provider that is down
// therefore held the HTTP request open for 25 seconds before answering.
//
// The abandoned attempt keeps running: there is nothing to cancel, since the
// SDK takes no signal. Whatever it ends up doing is ignored -- the caller has
// already been answered, and the tokens it would carry belong to a request that
// no longer exists. Its late rejection needs no guard of its own: Promise.race
// attaches a handler to it, so it never becomes an unhandled rejection. A catch
// added here as a precaution was removed after a test proved it changed
// nothing.
export async function withDeadline<T>(
    work: Promise<T>,
    milliseconds: number,
    operation: string,
): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error(`${operation} exceeded its ${milliseconds} ms deadline`)),
            milliseconds,
        );
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
