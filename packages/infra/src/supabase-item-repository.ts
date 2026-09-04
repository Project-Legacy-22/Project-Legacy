import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { rehydrateItem } from '@legacy/core-items';
import type { DomainEvent, Item } from '@legacy/core-items';

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

// The storage adapter for the item domain. It talks to Supabase over HTTPS with
// the service-role key, so PostgREST does not apply row-level security and the
// application layer is responsible for ownership scoping (policies arrive with
// US-11).
export function createSupabaseItemStore(settings: SupabaseSettings): ItemStore {
    const client: SupabaseClient<Database> = createClient<Database>(
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

    async function findAll(): Promise<Item[]> {
        const { data, error } = await client.from('items').select('*');
        if (error) fail('findAll', error);
        return (data ?? []).map(toItem);
    }

    async function findById(id: string): Promise<Item | undefined> {
        const { data, error } = await client.from('items').select('*').eq('id', id).maybeSingle();
        if (error) fail('findById', error);
        return data ? toItem(data) : undefined;
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

    return { connect, disconnect, findAll, findById, save, update, remove };
}
