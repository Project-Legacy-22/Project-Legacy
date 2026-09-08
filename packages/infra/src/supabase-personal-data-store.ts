import { createClient } from '@supabase/supabase-js';

import type { ExportedItem, ExportedNotification, PersonalData, PersonalDataStore } from '@legacy/core-auth';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';

type UserRow = Database['public']['Tables']['users']['Row'];
type ItemRow = Database['public']['Tables']['items']['Row'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];

// Same posture as the item repository: supabase-js reports a failure as a value
// on `{ error }`, every call checks it, and a storage failure becomes a generic
// 500 through the single error middleware rather than an empty export.
//
// An empty export would be the dangerous outcome here. It is indistinguishable
// from an account that owns nothing, and a person told they own nothing has no
// reason to ask again.
function fail(operation: string, cause: unknown): never {
    throw new Error(`personal data store: ${operation} failed`, { cause });
}

// PostgREST renders a timestamptz with a numeric offset and microseconds,
// "2026-09-08T12:00:00.123456+00:00". The export states instants in UTC with a
// trailing Z, the form the rest of the API uses and the one the contract
// accepts, so every date crosses this function on the way out.
//
// The conversion drops sub-millisecond precision, which JavaScript dates cannot
// carry. Nothing in this document is read at that resolution, and two rows
// written in the same millisecond are still told apart by their identifiers.
function toInstant(value: string): string {
    return new Date(value).toISOString();
}

function toOptionalInstant(value: string | null): string | null {
    return value === null ? null : toInstant(value);
}

function toItem(row: ItemRow): ExportedItem {
    return {
        id: row.id,
        name: row.name,
        completed: row.completed,
        createdAt: toInstant(row.created_at),
        updatedAt: toInstant(row.updated_at),
        deletedAt: toOptionalInstant(row.deleted_at),
    };
}

function toNotification(row: NotificationRow): ExportedNotification {
    return {
        id: row.id,
        itemId: row.item_id,
        eventId: row.event_id,
        readAt: toOptionalInstant(row.read_at),
        createdAt: toInstant(row.created_at),
    };
}

function toPersonalData(
    account: UserRow,
    items: ItemRow[],
    notifications: NotificationRow[],
): PersonalData {
    return {
        account: { id: account.id, email: account.email, createdAt: toInstant(account.created_at) },
        items: items.map(toItem),
        notifications: notifications.map(toNotification),
    };
}

// The storage side of US-13: read everything one account owns, then remove it.
//
// It is a second adapter rather than four methods added to the item repository
// because the two answer to different ports. This one reads across the tables
// of several domains, which no single domain's repository is allowed to know
// about, and it is the only place in the application that does.
export function createSupabasePersonalDataStore(settings: SupabaseSettings): PersonalDataStore {
    const client = createClient<Database>(settings.url, settings.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    async function exportFor(accountId: string): Promise<PersonalData | undefined> {
        // Three independent reads, so three requests in flight at once rather
        // than one after the other. Oldest first in both collections: an export
        // is read by a person, and a history reads forwards.
        //
        // Items are not filtered on deleted_at. A removed item is still a row
        // this application holds, so it is still part of what is exported.
        const [account, items, notifications] = await Promise.all([
            client.from('users').select('*').eq('id', accountId).maybeSingle(),
            client.from('items').select('*').eq('user_id', accountId).order('created_at'),
            client.from('notifications').select('*').eq('user_id', accountId).order('created_at'),
        ]);

        if (account.error) fail('exportFor', account.error);
        if (items.error) fail('exportFor', items.error);
        if (notifications.error) fail('exportFor', notifications.error);
        if (account.data === null) return undefined;

        return toPersonalData(account.data, items.data ?? [], notifications.data ?? []);
    }

    async function eraseFor(accountId: string): Promise<void> {
        // One call to a database function rather than a delete per table.
        // PostgREST opens a transaction per request, so separate deletes would
        // be separate transactions and a failure in between would leave an
        // account half erased. The function body is a single transaction (see
        // the account erasure migration).
        const { error } = await client.rpc('erase_account', { p_user_id: accountId });
        if (error) fail('eraseFor', error);
    }

    return { exportFor, eraseFor };
}
