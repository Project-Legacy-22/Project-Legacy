import type { SupabaseClient } from '@supabase/supabase-js';
import { InvalidProjectCursor, rehydrateProject } from '@legacy/core-projects';
import type { Project, ProjectPage, ProjectPageQuery, ProjectRepository, ProjectRole } from '@legacy/core-projects';

import type { Database } from './database.types.js';
import { decodeKeysetCursor, encodeKeysetCursor } from './keyset-cursor.js';
import type { SupabaseSettings } from './supabase-item-repository.js';
import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure } from './adapter.js';

type ProjectClient = SupabaseClient<Database>;
type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectResultRow = Pick<ProjectRow, 'id' | 'name' | 'created_at'> & {
    project_memberships: { role: string }[];
    items: { count: number }[];
};

const fail: AdapterFailure = adapterFailure('projects repository');

function roleOf(row: ProjectResultRow): ProjectRole {
    const role = row.project_memberships[0]?.role;
    if (role === 'owner' || role === 'member') return role;
    fail('read role', new Error('the membership has an invalid role'));
}

function toProject(row: ProjectResultRow): Project {
    return rehydrateProject({
        id: row.id,
        name: row.name,
        role: roleOf(row),
        itemCount: row.items[0]?.count ?? 0,
    });
}

function encodeCursor(row: Pick<ProjectRow, 'created_at' | 'id'>): string {
    return encodeKeysetCursor({ createdAt: row.created_at, id: row.id });
}

function beforeCursor(cursor: string): string {
    const { createdAt, id } = decodeKeysetCursor(cursor, () => new InvalidProjectCursor());
    return `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`;
}

async function findPage(client: ProjectClient, memberId: string, page: ProjectPageQuery): Promise<ProjectPage> {
    const visible = client
        .from('projects')
        .select('id,name,created_at,project_memberships!inner(role),items(count)')
        .eq('project_memberships.user_id', memberId);
    const positioned = page.cursor === undefined ? visible : visible.or(beforeCursor(page.cursor));
    const { data, error } = await positioned
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(page.limit + 1);
    if (error) fail('findPageForMember', error);

    const rows: ProjectResultRow[] = data ?? [];
    const pageRows = rows.slice(0, page.limit);
    const last = pageRows.at(-1);
    return {
        projects: pageRows.map(toProject),
        nextCursor: rows.length > page.limit && last !== undefined ? encodeCursor(last) : undefined,
    };
}

export function createSupabaseProjectRepository(settings: SupabaseSettings): ProjectRepository {
    const client: ProjectClient = serviceRoleClient(settings);

    return {
        findPageForMember: (memberId, page) => findPage(client, memberId, page),
        async saveForOwner(project, ownerId) {
            const { error } = await client.rpc('create_project_for_owner', {
                p_project_id: project.id,
                p_user_id: ownerId,
                p_name: project.name,
            });
            if (error) fail('saveForOwner', error);
        },
        async removeForOwner(projectId, ownerId) {
            const { data: membership, error: membershipError } = await client
                .from('project_memberships')
                .select('project_id')
                .eq('project_id', projectId)
                .eq('user_id', ownerId)
                .eq('role', 'owner')
                .maybeSingle();
            if (membershipError) fail('removeForOwner membership check', membershipError);
            if (membership === null) return false;

            const { data, error } = await client
                .from('projects')
                .delete()
                .eq('id', projectId)
                .select('id')
                .maybeSingle();
            if (error) fail('removeForOwner', error);
            return data !== null;
        },
    };
}
