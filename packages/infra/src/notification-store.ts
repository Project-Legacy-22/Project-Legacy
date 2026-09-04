import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';

export interface NotificationStore {
    // Returns false when the event had already been handled, so the caller can
    // say so rather than guess. Idempotence is enforced by the primary key of
    // processed_events, not by reading first and writing after: two workers
    // racing would both pass that read.
    notifyItemCreated(eventId: string, userId: string, itemId: string): Promise<boolean>;
    countUnread(userId: string): Promise<number>;
}

function fail(operation: string, cause: unknown): never {
    throw new Error(`notifications: ${operation} failed`, { cause });
}

// Raised by PostgreSQL when a unique or primary key is violated. Here it means
// "already processed", which is the expected outcome of a redelivery and not an
// error to propagate.
const UNIQUE_VIOLATION = '23505';

export function createSupabaseNotificationStore(settings: SupabaseSettings): NotificationStore {
    const client: SupabaseClient<Database> = createClient<Database>(
        settings.url,
        settings.serviceRoleKey,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );

    return {
        async notifyItemCreated(eventId, userId, itemId) {
            // Claim the event first. Whoever wins this insert is the one that
            // creates the notification; a redelivery loses it and stops here.
            const claim = await client.from('processed_events').insert({ event_id: eventId });

            if (claim.error) {
                if (claim.error.code === UNIQUE_VIOLATION) return false;
                fail('claim', claim.error);
            }

            const { error } = await client
                .from('notifications')
                .insert({ event_id: eventId, user_id: userId, item_id: itemId });

            // The notification carries the same uniqueness rule, so even if the
            // claim above were bypassed the database still refuses a duplicate.
            if (error && error.code !== UNIQUE_VIOLATION) fail('notify', error);

            return true;
        },

        async countUnread(userId) {
            const { count, error } = await client
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .is('read_at', null);

            if (error) fail('countUnread', error);
            return count ?? 0;
        },
    };
}
