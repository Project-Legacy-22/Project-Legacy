import type { SupabaseClient } from '@supabase/supabase-js';

import {
    LastProjectOwner,
    ProjectMemberNotFound,
    ProjectNotFound,
    ProjectOwnerRequired,
} from '@legacy/core-projects';
import type {
    DomainEvent,
    Membership,
    MemberRemovalRepository,
    ProjectRole,
} from '@legacy/core-projects';

import { adapterFailure, serviceRoleClient } from './adapter.js';
import type { AdapterFailure, SupabaseSettings } from './adapter.js';
import type { Database } from './database.types.js';

// The memberships of a project, with the address of each member.
//
// The service role is needed rather than convenient: the only policy on
// project_memberships is project_memberships_select_self, so a session reads
// its own row and nothing else. Who may read the list is decided by the use
// case, which answers like a missing project when the caller is not in it.
//
// The join reaches users for the address. Nothing here can be asked « which
// accounts exist » -- the only entry point is a project identifier, and it
// returns that project's rows.
const fail: AdapterFailure = adapterFailure('membership repository');

type MembershipRow = {
    user_id: string;
    role: string;
    // PostgREST embeds a to-one relationship as an object, and types it as
    // possibly null because it cannot know the foreign key is NOT NULL.
    users: { email: string } | null;
};

function asRole(value: string): ProjectRole {
    if (value === 'owner' || value === 'member') return value;
    fail('read role', new Error(`the membership carries an invalid role: ${value}`));
}

// A membership without its account would be a row referencing a user that the
// foreign key says must exist. Refused rather than rendered with an empty
// address: a member shown without an address is a member nobody can name.
function toMembership(row: MembershipRow): Membership {
    if (row.users === null) {
        fail('read member', new Error(`membership of ${row.user_id} has no account`));
    }

    return { userId: row.user_id, email: row.users.email, role: asRole(row.role) };
}

function checkRemovalResult(result: unknown, projectId: string): void {
    switch (result) {
        case 'removed': return;
        case 'project_not_found': throw new ProjectNotFound(projectId);
        case 'owner_required': throw new ProjectOwnerRequired();
        case 'member_not_found': throw new ProjectMemberNotFound();
        case 'last_owner': throw new LastProjectOwner();
        default: fail('removeMember', new Error('Invalid member removal result'));
    }
}

export function createSupabaseMembershipRepository(
    settings: SupabaseSettings,
): MemberRemovalRepository {
    const client: SupabaseClient<Database> = serviceRoleClient(settings);

    return {
        async membersOf(projectId) {
            const { data, error } = await client
                .from('project_memberships')
                .select('user_id,role,users!inner(email)')
                .eq('project_id', projectId)
                // Owners first -- descending, because « member » precedes
                // « owner » alphabetically. A stable order matters: a list
                // that reshuffles between two reads makes a screen jump for
                // no reason.
                .order('role', { ascending: false })
                .order('user_id', { ascending: true });

            if (error) fail('membersOf', error);

            return (data ?? []).map(row => toMembership(row as MembershipRow));
        },

        // A single request, hence a single transaction: the function writes the membership and the
        // event, or neither. Two PostgREST calls would be two transactions.
        //
        // The authorisation -- being an owner -- was checked by the use case before getting here.
        // The service role is not constrained by RLS, so this application check must not be
        // removed.
        async addWithEvent({ projectId, memberId }, event: DomainEvent) {
            const { data, error } = await client.rpc('add_member_with_event', {
                p_project_id: projectId,
                p_user_id: memberId,
                p_event_id: event.id,
                p_event_name: event.name,
                p_occurred_at: event.occurredAt,
                p_payload: event.payload,
            });

            if (error) fail('addWithEvent', error);

            // The function returns false when the person was already a member. `?? false` covers
            // the case where PostgREST would return null: better to announce "nothing added" than
            // to let an undefined through.
            return data ?? false;
        },

        async removeMember({ projectId, callerId, memberId }) {
            const { data, error } = await client.rpc('remove_project_member', {
                p_project_id: projectId,
                p_caller_id: callerId,
                p_member_id: memberId,
            });
            if (error) fail('removeMember', error);
            checkRemovalResult(data, projectId);
        },
    };
}
