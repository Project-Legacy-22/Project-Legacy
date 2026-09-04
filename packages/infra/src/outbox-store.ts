import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainEvent } from '@legacy/contracts';
import type { DomainEvent as Event } from '@legacy/contracts';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';

// The relay's view of the outbox: read what has not been published, and record
// that it has been. Writing to the outbox is not here, because nothing outside
// a business transaction is allowed to add to it.
export interface OutboxStore {
    // Oldest first: a consumer that rebuilds state from events must see them in
    // the order the facts happened.
    unpublished(limit: number): Promise<Event[]>;
    markPublished(eventIds: readonly string[]): Promise<void>;
}

function fail(operation: string, cause: unknown): never {
    throw new Error(`outbox: ${operation} failed`, { cause });
}

export function createSupabaseOutboxStore(settings: SupabaseSettings): OutboxStore {
    const client: SupabaseClient<Database> = createClient<Database>(
        settings.url,
        settings.serviceRoleKey,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );

    return {
        async unpublished(limit) {
            const { data, error } = await client
                .from('outbox')
                .select('id, name, occurred_at, payload')
                .is('published_at', null)
                .order('occurred_at', { ascending: true })
                .limit(limit);

            if (error) fail('unpublished', error);

            // Validated on the way out, not trusted because it came from our
            // own database: a row written by an older version of the code, or
            // by hand, must not reach a consumer as if it were well formed.
            return (data ?? []).map(row => {
                const parsed = DomainEvent.safeParse({
                    id: row.id,
                    name: row.name,
                    occurredAt: row.occurred_at,
                    payload: row.payload,
                });

                if (!parsed.success) fail(`unpublished: event ${row.id} does not match the catalogue`, parsed.error);
                return parsed.data;
            });
        },

        async markPublished(eventIds) {
            if (eventIds.length === 0) return;

            const { error } = await client
                .from('outbox')
                .update({ published_at: new Date().toISOString() })
                .in('id', [...eventIds]);

            if (error) fail('markPublished', error);
        },
    };
}
