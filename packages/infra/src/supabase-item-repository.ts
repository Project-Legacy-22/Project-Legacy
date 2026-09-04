import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { Buffer } from 'node:buffer';

import { InvalidItemCursor, rehydrateItem } from '@legacy/core-items';
import type { DomainEvent, Item, ItemPage, ItemPageQuery } from '@legacy/core-items';

import type { Database } from './database.types.js';
import type { ItemStore } from './item-store.js';

type ItemRow = Database['public']['Tables']['items']['Row'];

export interface SupabaseSettings {
    url: string;
    serviceRoleKey: string;
}

// supabase-js reports failures as a value on `{ error }` rather than by
// throwing. Every call checks it and rethrows through here: a storage failure is
// a technical error, it must bubble to the single error middleware and become a
// generic 500, never be swallowed or turned into an empty result.
function fail(operation: string, cause: unknown): never {
    throw new Error(`items repository: ${operation} failed`, { cause });
}

function toItem(row: ItemRow): Item {
    return rehydrateItem({
        id: row.id,
        name: row.name,
        completed: row.completed,
        ownerId: row.user_id,
    });
}

// A page is located by its last row, not by an offset that would shift under a
// concurrent insert. created_at alone is not unique -- two rows written in one
// transaction share it -- so the position is the pair, which is also the order
// items_user_id_created_at_idx serves. Encoded, so no client pins the ordering.
function encodeCursor(row: ItemRow): string {
    return Buffer.from(`${row.created_at} ${row.id}`, 'utf8').toString('base64url');
}

// The predicate for a position strictly before the cursor. base64url decoding
// never fails, so the shape it decodes to is what proves the cursor is ours. The
// timestamp is quoted: PostgREST reads ',' '.' and ':' as filter syntax.
function beforeCursor(cursor: string): string {
    const [createdAt, id, ...extra] = Buffer.from(cursor, 'base64url')
        .toString('utf8')
        .split(' ');

    if (createdAt === undefined || id === undefined || extra.length > 0) {
        throw new InvalidItemCursor();
    }

    return `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`;
}

// The reads sit outside the factory: they need nothing from it but the client.
type ItemClient = SupabaseClient<Database>;

async function findPage(
    client: ItemClient,
    ownerId: string,
    page: ItemPageQuery,
): Promise<ItemPage> {
    const owned = client.from('items').select('*').eq('user_id', ownerId).is('deleted_at', null);
    const positioned = page.cursor === undefined ? owned : owned.or(beforeCursor(page.cursor));

    // One row more than asked: its presence is what says there is a next page.
    const { data, error } = await positioned
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(page.limit + 1);
    if (error) fail('findPageByOwner', error);

    const rows = data ?? [];
    const visible = rows.slice(0, page.limit);
    const last = visible.at(-1);

    return {
        items: visible.map(toItem),
        nextCursor: rows.length > page.limit && last !== undefined ? encodeCursor(last) : undefined,
    };
}

async function findOwned(
    client: ItemClient,
    id: string,
    ownerId: string,
): Promise<Item | undefined> {
    const { data, error } = await client
        .from('items')
        .select('*')
        .eq('id', id)
        .eq('user_id', ownerId)
        .is('deleted_at', null)
        .maybeSingle();
    if (error) fail('findByIdForOwner', error);
    return data ? toItem(data) : undefined;
}

// The storage adapter for the item domain. It talks to Supabase over HTTPS with
// the service-role key, so PostgREST does not apply row-level security and the
// application layer is responsible for ownership scoping.
export function createSupabaseItemStore(settings: SupabaseSettings): ItemStore {
    const client: ItemClient = createClient<Database>(
        settings.url,
        settings.serviceRoleKey,
        { auth: { persistSession: false, autoRefreshToken: false } },
    );

    async function connect(): Promise<void> {
        // A cheap read that proves the URL and the key are usable. It replaces
        // the CREATE TABLE the old adapters ran here: the schema is the
        // migrations' job, not the app's.
        const { error } = await client.from('items').select('id').limit(1);
        if (error) fail('connect', error);
    }

    async function disconnect(): Promise<void> {
        // supabase-js holds no long-lived connection to close.
    }

    // One call to a database function rather than two inserts. PostgREST opens
    // a transaction per request, so writing the item and then its event would
    // be two of them: a failure in between would leave the event announcing a
    // creation that was rolled back. The function body is a single transaction
    // (see the outbox migration).
    async function save(item: Item, event: DomainEvent): Promise<void> {
        if (item.name === null) fail('save', new Error('an item written to storage must have a name'));
        const { error } = await client.rpc('create_item_with_event', {
            p_item_id: item.id,
            p_user_id: item.ownerId,
            p_name: item.name,
            p_event_id: event.id,
            p_event_name: event.name,
            p_occurred_at: event.occurredAt,
            p_payload: event.payload,
        });
        if (error) fail('save', error);
    }

    async function update(item: Item): Promise<void> {
        if (item.name === null) fail('update', new Error('an item written to storage must have a name'));
        const { error } = await client
            .from('items')
            .update({ name: item.name, completed: item.completed })
            .eq('id', item.id);
        if (error) fail('update', error);
    }

    async function remove(id: string): Promise<void> {
        const { error } = await client.from('items').delete().eq('id', id);
        if (error) fail('remove', error);
    }

    return {
        connect,
        disconnect,
        findPageByOwner: (ownerId, page) => findPage(client, ownerId, page),
        findByIdForOwner: (id, ownerId) => findOwned(client, id, ownerId),
        save,
        update,
        remove,
    };
}
