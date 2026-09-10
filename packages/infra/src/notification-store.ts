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

export function createSupabaseNotificationStore(settings: SupabaseSettings): NotificationStore {
    const client: SupabaseClient<Database> = createClient<Database>(
        settings.url,
        settings.serviceRoleKey,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );

    return {
        async notifyItemCreated(eventId, userId, itemId) {
            // One call to a database function. Claiming the event and creating
            // its notification are two writes that must not be able to happen
            // separately: split across two statements they were two
            // transactions, and a claim that outlived a failed insert turned
            // every later redelivery into a no-op for an effect that had never
            // been applied.
            const { data, error } = await client.rpc('record_item_created_notification', {
                p_event_id: eventId,
                p_user_id: userId,
                p_item_id: itemId,
            });

            if (error) fail('notify', error);

            // false when the event had already been handled, which is the
            // expected outcome of a redelivery.
            return data === true;
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
