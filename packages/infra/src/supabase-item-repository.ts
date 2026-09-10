import { Buffer } from 'node:buffer';
import type { SupabaseClient } from '@supabase/supabase-js';

import { InvalidItemCursor, ITEM_PRIORITIES, rehydrateItem } from '@legacy/core-items';
import type { DomainEvent, Item, ItemPage, ItemPageQuery, ItemPriority, ItemStatusMove } from '@legacy/core-items';

import type { Database } from './database.types.js';
import type { ItemStore } from './item-store.js';
import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

type ItemRow = Database['public']['Tables']['items']['Row'];

export interface SupabaseSettings {
    url: string;
    serviceRoleKey: string;
}

// supabase-js reports failures as a value on `{ error }` rather than by
// throwing. Every call checks it and rethrows through here: a storage failure is
// a technical error, it must bubble to the single error middleware and become a
// generic 500, never be swallowed or turned into an empty result.
const fail: AdapterFailure = adapterFailure('items repository');

function toItem(row: ItemRow): Item {
    return rehydrateItem({
        id: row.id,
        name: row.name,
        status: row.status,
        version: row.version,
        priority: row.priority,
        dueDate: row.due_date,
        projectId: row.project_id,
        ownerId: row.user_id,
    });
}

interface ItemPosition {
    priority: ItemPriority;
    dueDate: string | null;
    id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day));
    return date.toISOString().slice(0, 10) === value;
}

function isPosition(value: unknown): value is ItemPosition {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return Object.keys(candidate).length === 3
        && typeof candidate.priority === 'string'
        && ITEM_PRIORITIES.includes(candidate.priority as ItemPriority)
        && (candidate.dueDate === null || isCalendarDate(candidate.dueDate))
        && typeof candidate.id === 'string'
        && UUID_PATTERN.test(candidate.id);
}

// A page is located by its last row, not by an offset that would shift under a
// concurrent insert. The cursor carries every sort key and remains opaque to
// callers. The UUID is the final unique key, so equivalent tasks never change
// order between requests.
function encodeCursor(row: ItemRow): string {
    return Buffer.from(JSON.stringify({
        priority: row.priority,
        dueDate: row.due_date,
        id: row.id,
    }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): ItemPosition {
    try {
        const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (isPosition(value)) return value;
    } catch {
        // The domain error below is the only cursor failure exposed to callers.
    }
    throw new InvalidItemCursor();
}

// The predicate starts strictly after the supplied position in the public
// order: high-to-low priority, nearest dated task first, undated tasks last,
// then UUID. Each interpolated value has been validated above before it reaches
// PostgREST filter syntax.
function afterCursor(cursor: string): string {
    const { priority, dueDate, id } = decodeCursor(cursor);
    if (dueDate === null) {
        return `priority.lt.${priority},and(priority.eq.${priority},due_date.is.null,id.gt.${id})`;
    }
    return `priority.lt.${priority},and(priority.eq.${priority},or(due_date.gt.${dueDate},and(due_date.eq.${dueDate},id.gt.${id}),due_date.is.null))`;
}

// The reads sit outside the factory: they need nothing from it but the client.
type ItemClient = SupabaseClient<Database>;

interface PageRequest {
    client: ItemClient;
    projectId: string;
    memberId: string;
    page: ItemPageQuery;
}

async function findPage(request: PageRequest): Promise<ItemPage | undefined> {
    const { client, projectId, memberId, page } = request;
    if (!(await isProjectMember(client, projectId, memberId))) return undefined;

    const inProject = client.from('items').select('*').eq('project_id', projectId);
    const positioned = page.cursor === undefined ? inProject : inProject.or(afterCursor(page.cursor));

    // One row more than asked: its presence is what says there is a next page.
    const { data, error } = await positioned
        .order('priority', { ascending: false })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })
        .limit(page.limit + 1);
    if (error) fail('findPageForMember', error);

    const rows = data ?? [];
    const visible = rows.slice(0, page.limit);
    const last = visible.at(-1);

    return {
        items: visible.map(toItem),
        nextCursor: rows.length > page.limit && last !== undefined ? encodeCursor(last) : undefined,
    };
}

interface MemberItemRequest {
    client: ItemClient;
    id: string;
    projectId: string;
    memberId: string;
}

async function findForMember(request: MemberItemRequest): Promise<Item | undefined> {
    const { client, id, projectId, memberId } = request;
    if (!(await isProjectMember(client, projectId, memberId))) return undefined;

    const { data, error } = await client
        .from('items')
        .select('*')
        .eq('id', id)
        .eq('project_id', projectId)
        .maybeSingle();
    if (error) fail('findByIdForMember', error);
    return data ? toItem(data) : undefined;
}

async function isProjectMember(client: ItemClient, projectId: string, memberId: string): Promise<boolean> {
    const { data, error } = await client
        .from('project_memberships')
        .select('project_id')
        .eq('project_id', projectId)
        .eq('user_id', memberId)
        .maybeSingle();
    if (error) fail('isProjectMember', error);
    return data !== null;
}

async function connect(client: ItemClient): Promise<void> {
    const { error } = await client.from('items').select('id').limit(1);
    if (error) fail('connect', error);
}

async function disconnect(): Promise<void> {
    // supabase-js holds no long-lived connection to close.
}

async function save(client: ItemClient, item: Item, event: DomainEvent): Promise<void> {
    if (item.name === null) fail('save', new Error('an item written to storage must have a name'));
    // makeAddItem checks the caller's membership before reaching this internal
    // RPC. Only the backend service role may execute it; RLS does not constrain
    // that role, so the application check must not be removed.
    const { error } = await client.rpc('create_item_with_event', {
        p_item_id: item.id,
        p_user_id: item.ownerId,
        p_project_id: item.projectId,
        p_name: item.name,
        p_priority: item.priority,
        // Supabase's generator does not represent nullable Postgres function
        // arguments. The SQL parameter accepts NULL and the integration suite
        // exercises that path for the default undated item.
        // @ts-expect-error p_due_date is nullable in the database function
        p_due_date: item.dueDate,
        p_event_id: event.id,
        p_event_name: event.name,
        p_occurred_at: event.occurredAt,
        p_payload: event.payload,
    });
    if (error) fail('save', error);
}

async function update(client: ItemClient, item: Item): Promise<void> {
    if (item.name === null) fail('update', new Error('an item written to storage must have a name'));
    const { error } = await client
        .from('items')
        .update({
            name: item.name,
            status: item.status,
            version: item.version,
            priority: item.priority,
            due_date: item.dueDate,
        })
        .eq('id', item.id);
    if (error) fail('update', error);
}

async function moveStatus(client: ItemClient, move: ItemStatusMove): Promise<Item | undefined> {
    const { data, error } = await client
        .from('items')
        .update({ status: move.status, version: move.expectedVersion + 1 })
        .eq('id', move.id)
        .eq('project_id', move.projectId)
        .eq('version', move.expectedVersion)
        .select('*')
        .maybeSingle();
    if (error) fail('moveStatus', error);
    return data ? toItem(data) : undefined;
}

async function remove(client: ItemClient, id: string): Promise<void> {
    const { error } = await client.from('items').delete().eq('id', id);
    if (error) fail('remove', error);
}

// The storage adapter for the item domain. It talks to Supabase over HTTPS with
// the service-role key, so PostgREST does not apply row-level security and the
// application layer is responsible for project-membership scoping.
export function createSupabaseItemStore(settings: SupabaseSettings): ItemStore {
    const client: ItemClient = serviceRoleClient(settings);

    // One call to a database function rather than two inserts. PostgREST opens
    // a transaction per request, so writing the item and then its event would
    // be two of them: a failure in between would leave the event announcing a
    // creation that was rolled back. The function body is a single transaction
    // (see the outbox migration).
    return {
        connect: () => connect(client),
        disconnect,
        isProjectMember: (projectId, memberId) => isProjectMember(client, projectId, memberId),
        findPageForMember: (projectId, memberId, page) => findPage({ client, projectId, memberId, page }),
        findByIdForMember: (id, projectId, memberId) => findForMember({ client, id, projectId, memberId }),
        save: (item, event) => save(client, item, event),
        update: (item) => update(client, item),
        moveStatus: (move) => moveStatus(client, move),
        remove: (id) => remove(client, id),
    };
}
