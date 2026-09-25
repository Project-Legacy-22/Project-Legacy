import type { SupabaseClient } from '@supabase/supabase-js';

import { PurgeResult } from '@legacy/contracts';
import type { Logger } from '@legacy/contracts';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';
import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

// The retention purge (US-39). The periods live in purge_expired_data, next to
// the rows they apply to, and restate docs/gdpr/registre.md; this side only
// asks for a pass and reports what it removed.
export interface RetentionStore {
    purgeExpired(): Promise<PurgeResult>;
}

const fail: AdapterFailure = adapterFailure('retention');

const TREATMENTS: Readonly<Record<string, keyof PurgeResult>> = {
    notifications: 'notifications',
    processed_events: 'processedEvents',
    outbox: 'outbox',
};

export function createSupabaseRetentionStore(settings: SupabaseSettings): RetentionStore {
    const client: SupabaseClient<Database> = serviceRoleClient(settings);

    return {
        async purgeExpired() {
            const { data, error } = await client.rpc('purge_expired_data', {});
            if (error) fail('purgeExpired', error);

            // Validated rather than trusted: a treatment this side does not
            // know would otherwise vanish from the trace without a word.
            const counts: Record<string, number> = {};
            for (const row of data ?? []) {
                const key = TREATMENTS[row.treatment];
                if (key === undefined) fail(`purgeExpired: unknown treatment ${row.treatment}`, row);
                counts[key] = row.deleted;
            }

            const parsed = PurgeResult.safeParse(counts);
            if (!parsed.success) fail('purgeExpired: incomplete result', parsed.error);
            return parsed.data;
        },
    };
}

// One pass, and one log line per treatment: the date is the line's own, and
// the fields are a treatment name and a count, never a row.
export async function purgeExpired(store: RetentionStore, logger: Logger): Promise<PurgeResult> {
    const result = await store.purgeExpired();

    for (const [treatment, deleted] of Object.entries(result)) {
        logger.info({ treatment, deleted }, 'retention purge');
    }

    return result;
}
