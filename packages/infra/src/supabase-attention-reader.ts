import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    AttentionEntry,
    AttentionGroup,
    AttentionGroupQuery,
    AttentionReader,
    AttentionWindow,
    Workload,
} from '@legacy/core-items';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';
import { ITEM_WITH_ASSIGNEES, toItem } from './supabase-item-repository.js';
import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

type AttentionClient = SupabaseClient<Database>;

const fail: AdapterFailure = adapterFailure('attention reader');

// The item, its project's name, and the caller's membership of that project.
// Both embeddings are inner joins: an item whose project has no membership row
// for the caller is not returned at all, rather than returned with an empty
// membership list. That join is the whole authorization of this read.
const ITEM_IN_MEMBER_PROJECT = `${ITEM_WITH_ASSIGNEES}, projects!inner(name, project_memberships!inner(user_id))`;
const MEMBER_FILTER = 'projects.project_memberships.user_id';

function itemsOfMember(client: AttentionClient, memberId: string) {
    return client
        .from('items')
        .select(ITEM_IN_MEMBER_PROJECT)
        .eq(MEMBER_FILTER, memberId)
        .neq('status', 'done');
}

type OpenItemsQuery = ReturnType<typeof itemsOfMember>;

// The SQL form of attentionGroupOf in the domain, group by group. Both dates
// come from attentionWindow, which only lets a real calendar day through, so
// nothing a client typed reaches the .or() expression unchecked.
function inGroup(query: OpenItemsQuery, group: AttentionGroupQuery['group'], window: AttentionWindow): OpenItemsQuery {
    switch (group) {
        case 'overdue':
            return query.lt('due_date', window.today);
        case 'dueSoon':
            return query.gte('due_date', window.today).lte('due_date', window.tomorrow);
        case 'highPriority':
            return query.eq('priority', 'high').or(`due_date.is.null,due_date.gt.${window.tomorrow}`);
    }
}

async function findGroup(client: AttentionClient, query: AttentionGroupQuery): Promise<AttentionGroup> {
    // One row past the limit, only to learn whether there is more.
    const { data, error } = await inGroup(itemsOfMember(client, query.memberId), query.group, query.window)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('priority', { ascending: false })
        .order('id', { ascending: true })
        .limit(query.limit + 1);
    if (error) fail(`findGroupForMember ${query.group}`, error);

    const rows = data ?? [];
    const entries: AttentionEntry[] = rows
        .slice(0, query.limit)
        .map((row) => ({ item: toItem(row), projectName: row.projects.name }));
    return { entries, hasMore: rows.length > query.limit };
}

// Two existence checks, not two counts: the screen needs to know which of three
// situations it is in, not how many tasks there are.
async function workloadOf(client: AttentionClient, memberId: string): Promise<Workload> {
    const anyItem = client.from('items').select(ITEM_IN_MEMBER_PROJECT).eq(MEMBER_FILTER, memberId).limit(1);
    const [all, open] = await Promise.all([anyItem, itemsOfMember(client, memberId).limit(1)]);
    if (all.error) fail('workloadOf any item', all.error);
    if (open.error) fail('workloadOf open item', open.error);

    if ((all.data ?? []).length === 0) return 'none';
    return (open.data ?? []).length === 0 ? 'all_done' : 'open';
}

export function createSupabaseAttentionReader(settings: SupabaseSettings): AttentionReader {
    const client: AttentionClient = serviceRoleClient(settings);

    return {
        findGroupForMember: (query) => findGroup(client, query),
        workloadOf: (memberId) => workloadOf(client, memberId),
    };
}
