import type { SupabaseClient } from '@supabase/supabase-js';

import { DomainEvent } from '@legacy/contracts';
import type { DomainEvent as Event } from '@legacy/contracts';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';
import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

// The relay's view of the outbox: read what has not been published, and record
// that it has been. Writing to the outbox is not here, because nothing outside
// a business transaction is allowed to add to it.
export interface OutboxStore {
    // Oldest first: a consumer that rebuilds state from events must see them in
    // the order the facts happened.
    unpublished(limit: number): Promise<Event[]>;
    markPublished(eventIds: readonly string[]): Promise<void>;
}

const fail: AdapterFailure = adapterFailure('outbox');

// PostgreSQL renders a timestamptz with a numeric offset (`+00:00`), while the
// catalogue's canonical form ends in `Z`. Both denote the same instant.
//
// The conversion returns the raw value when it cannot parse, instead of letting
// toISOString throw a RangeError: a row that cannot be read must be rejected by
// the schema below, with the event named, not by an exception nobody catches.
// Thrown here it would abort the whole batch on every pass, blocking the valid
// events alongside it until someone intervened.
function asInstant(value: string): string {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function createSupabaseOutboxStore(settings: SupabaseSettings): OutboxStore {
    const client: SupabaseClient<Database> = serviceRoleClient(settings);

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
                    // PostgreSQL renders a timestamptz with a numeric offset
                    // (`+00:00`), while the catalogue's canonical form ends in
                    // `Z`. Both denote the same instant; normalising here keeps
                    // the contract strict about one shape on the wire and keeps
                    // the storage representation where it belongs, in the
                    // adapter. Read straight through, the relay rejects the
                    // very events it wrote.
                    occurredAt: asInstant(row.occurred_at),
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
