import type { SupabaseClient } from '@supabase/supabase-js';

import type {
    DomainEvent,
    Membership,
    MembershipRepository,
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

export function createSupabaseMembershipRepository(
    settings: SupabaseSettings,
): MembershipRepository {
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

        // Une seule requete, donc une seule transaction : la fonction ecrit
        // l appartenance et l evenement, ou ni l un ni l autre. Deux appels
        // PostgREST seraient deux transactions.
        //
        // L autorisation -- etre proprietaire -- a ete verifiee par le cas
        // d usage avant d arriver ici. Le service-role n est pas contraint par
        // RLS, donc ce controle applicatif ne doit pas etre retire.
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

            // La fonction rend false quand la personne etait deja membre.
            // `?? false` couvre le cas ou PostgREST rendrait null : mieux vaut
            // annoncer « rien ajoute » que de laisser passer un undefined.
            return data ?? false;
        },
    };
}
