import type { SupabaseClient } from '@supabase/supabase-js';

import type {
    ExportedItem,
    ExportedNotification,
    ExportedProject,
    ExportedProjectMembership,
    PersonalData,
    PersonalDataStore,
} from '@legacy/core-auth';

import type { Database } from './database.types.js';
import type { SupabaseSettings } from './supabase-item-repository.js';
import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

type UserRow = Database['public']['Tables']['users']['Row'];
type ItemRow = Database['public']['Tables']['items']['Row'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectMembershipRow = Database['public']['Tables']['project_memberships']['Row'];
type PersonalDataClient = SupabaseClient<Database>;

// Same posture as the item repository: supabase-js reports a failure as a value
// on `{ error }`, every call checks it, and a storage failure becomes a generic
// 500 through the single error middleware rather than an empty export.
//
// An empty export would be the dangerous outcome here. It is indistinguishable
// from an account that owns nothing, and a person told they own nothing has no
// reason to ask again.
const fail: AdapterFailure = adapterFailure('personal data store');

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
        projectId: row.project_id,
        name: row.name,
        status: row.status,
        version: row.version,
        createdAt: toInstant(row.created_at),
        updatedAt: toInstant(row.updated_at),
    };
}

function toProject(row: ProjectRow): ExportedProject {
    return {
        id: row.id,
        name: row.name,
        createdAt: toInstant(row.created_at),
        updatedAt: toInstant(row.updated_at),
    };
}

function toProjectMembership(row: ProjectMembershipRow): ExportedProjectMembership {
    if (row.role !== 'owner' && row.role !== 'member') {
        fail('exportFor', new Error('unknown project membership role'));
    }

    return {
        projectId: row.project_id,
        role: row.role,
        createdAt: toInstant(row.created_at),
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

interface PersonalDataRows {
    account: UserRow;
    projects: ProjectRow[];
    projectMemberships: ProjectMembershipRow[];
    items: ItemRow[];
    notifications: NotificationRow[];
}

function toPersonalData(rows: PersonalDataRows): PersonalData {
    return {
        account: {
            id: rows.account.id,
            email: rows.account.email,
            createdAt: toInstant(rows.account.created_at),
        },
        projects: rows.projects.map(toProject),
        projectMemberships: rows.projectMemberships.map(toProjectMembership),
        items: rows.items.map(toItem),
        notifications: rows.notifications.map(toNotification),
    };
}

function checked<T>(result: { data: T; error: unknown }, operation: string): T {
    if (result.error) fail(operation, result.error);
    return result.data;
}

async function projectsFor(client: PersonalDataClient, memberships: ProjectMembershipRow[]): Promise<ProjectRow[]> {
    if (memberships.length === 0) return [];

    const result = await client
        .from('projects')
        .select('*')
        .in(
            'id',
            memberships.map((row) => row.project_id),
        )
        .order('created_at');

    return checked(result, 'exportFor') ?? [];
}

// The storage side of US-13: read everything one account owns, then remove it.
//
// It is a second adapter rather than four methods added to the item repository
// because the two answer to different ports. This one reads across the tables
// of several domains, which no single domain's repository is allowed to know
// about, and it is the only place in the application that does.
export function createSupabasePersonalDataStore(settings: SupabaseSettings): PersonalDataStore {
    const client = serviceRoleClient(settings);

    async function exportFor(accountId: string): Promise<PersonalData | undefined> {
        // Three independent reads, so three requests in flight at once rather
        // than one after the other. Oldest first in both collections: an export
        // is read by a person, and a history reads forwards.
        //
        const [account, items, notifications, projectMemberships] = await Promise.all([
            client.from('users').select('*').eq('id', accountId).maybeSingle(),
            client.from('items').select('*').eq('user_id', accountId).order('created_at'),
            client.from('notifications').select('*').eq('user_id', accountId).order('created_at'),
            client.from('project_memberships').select('*').eq('user_id', accountId).order('created_at'),
        ]);

        const accountRow = checked(account, 'exportFor');
        const itemRows = checked(items, 'exportFor') ?? [];
        const notificationRows = checked(notifications, 'exportFor') ?? [];
        const membershipRows = checked(projectMemberships, 'exportFor') ?? [];
        if (accountRow === null) return undefined;

        return toPersonalData({
            account: accountRow,
            projects: await projectsFor(client, membershipRows),
            projectMemberships: membershipRows,
            items: itemRows,
            notifications: notificationRows,
        });
    }

    async function eraseFor(accountId: string): Promise<void> {
        // One call to a database function rather than a delete per table.
        // PostgREST opens a transaction per request, so separate deletes would
        // be separate transactions and a failure in between would leave an
        // account half erased. The function body is a single transaction (see
        // the account erasure migration).
        const { error } = await client.rpc('erase_account', {
            p_user_id: accountId,
        });
        if (error) fail('eraseFor', error);
    }

    return { exportFor, eraseFor };
}
