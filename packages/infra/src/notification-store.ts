import type { SupabaseClient } from '@supabase/supabase-js';

import { Buffer } from 'node:buffer';

import { InvalidNotificationCursor } from '@legacy/core-notifications';
import type {
    Notification,
    NotificationPage,
    NotificationPageQuery,
    NotificationRepository,
} from '@legacy/core-notifications';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';
import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type NotificationClient = SupabaseClient<Database>;

export interface NotificationStore extends NotificationRepository {
    // Returns false when the event had already been handled, so the caller can
    // say so rather than guess. Idempotence is enforced by the primary key of
    // processed_events, not by reading first and writing after: two workers
    // racing would both pass that read.
    notifyItemCreated(eventId: string, userId: string, itemId: string): Promise<boolean>;
}

const fail: AdapterFailure = adapterFailure('notifications');

function toNotification(row: NotificationRow): Notification {
    return {
        id: row.id,
        itemId: row.item_id,
        userId: row.user_id,
        readAt: row.read_at,
        createdAt: row.created_at,
    };
}

// A page is located by its last row, not by an offset that would shift under a
// concurrent write. Same shape as supabase-item-repository.ts's own cursor:
// created_at alone is not unique, so the position is the pair, encoded so no
// client pins the ordering.
function encodeCursor(row: NotificationRow): string {
    return Buffer.from(`${row.created_at} ${row.id}`, 'utf8').toString('base64url');
}

function beforeCursor(cursor: string): string {
    const [createdAt, id, ...extra] = Buffer.from(cursor, 'base64url')
        .toString('utf8')
        .split(' ');

    if (createdAt === undefined || id === undefined || extra.length > 0) {
        throw new InvalidNotificationCursor();
    }

    return `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`;
}

async function findPage(
    client: NotificationClient,
    accountId: string,
    page: NotificationPageQuery,
): Promise<NotificationPage> {
    const owned = client.from('notifications').select('*').eq('user_id', accountId);
    const positioned = page.cursor === undefined ? owned : owned.or(beforeCursor(page.cursor));

    // One row more than asked: its presence is what says there is a next page.
    const { data, error } = await positioned
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(page.limit + 1);
    if (error) fail('findPageForAccount', error);

    const rows = data ?? [];
    const visible = rows.slice(0, page.limit);
    const last = visible.at(-1);

    return {
        notifications: visible.map(toNotification),
        nextCursor: rows.length > page.limit && last !== undefined ? encodeCursor(last) : undefined,
    };
}

export function createSupabaseNotificationStore(settings: SupabaseSettings): NotificationStore {
    const client: NotificationClient = serviceRoleClient(settings);

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

        findPageForAccount: (accountId, page) => findPage(client, accountId, page),

        async markAsRead(id, accountId) {
            // One statement rather than a read to decide whether to write: see
            // mark_notification_read in the migration for why.
            const { data, error } = await client.rpc('mark_notification_read', {
                p_id: id,
                p_account_id: accountId,
            });

            if (error) fail('markAsRead', error);
            return data === true;
        },

        async countUnread(accountId) {
            const { count, error } = await client
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', accountId)
                .is('read_at', null);

            if (error) fail('countUnread', error);
            return count ?? 0;
        },
    };
}
