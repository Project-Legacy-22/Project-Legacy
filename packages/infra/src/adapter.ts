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

// A deadline for a call whose own retries cannot be bounded: the SDK retries a
// failed refresh for about 25 seconds and exposes no way to shorten it (#214).
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
