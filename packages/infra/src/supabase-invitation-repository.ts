import type { SupabaseClient } from '@supabase/supabase-js';

import type {
    DomainEvent,
    InvitationOutcome,
    InvitationRepository,
    NewInvitation,
    PendingInvitation,
    ProjectRole,
} from '@legacy/core-projects';

import { adapterFailure, asInstant, serviceRoleClient } from './adapter.js';
import type { AdapterFailure, SupabaseSettings } from './adapter.js';
import type { Database } from './database.types.js';

// Invitations into a project (#401), through the service role like every
// outbound adapter here: the use cases decide who may invite, and the database
// function decides, in the same statement as the answer, who may answer.
const fail: AdapterFailure = adapterFailure('invitation repository');

const OUTCOMES = new Set<string>(['invited', 'already_member', 'already_invited']);
const ANSWERS = new Set<string>(['accepted', 'declined', 'not_found', 'already_answered']);

type PendingRow = {
    id: string;
    project_id: string;
    created_at: string;
    // PostgREST embeds a to-one relationship as an object, and types it as
    // possibly null because it cannot know the foreign key is NOT NULL.
    projects: { name: string } | null;
    // Genuinely nullable (#425), not just a PostgREST typing quirk: invited_by
    // itself is nullable, so an erased inviter reads back as null here.
    inviter: { email: string } | null;
};

function asRole(value: string): ProjectRole {
    if (value === 'owner' || value === 'member') return value;
    fail('read role', new Error(`the membership carries an invalid role: ${value}`));
}

function toPending(row: PendingRow): PendingInvitation {
    // The project is still `not null` in the schema and cascades with it, so a
    // missing one is corruption. The inviter is not (#425): a null one means
    // that account was erased after inviting, a normal state to render rather
    // than a failure to raise.
    if (row.projects === null) {
        fail('read invitation', new Error(`invitation ${row.id} lost its project`));
    }
    return {
        id: row.id,
        projectId: row.project_id,
        projectName: row.projects.name,
        invitedByEmail: row.inviter?.email ?? null,
        createdAt: asInstant(row.created_at),
    };
}

type InvitationClient = SupabaseClient<Database>;

// One call, so one transaction: the invitation and its event, or neither.
async function invite(client: InvitationClient, invitation: NewInvitation, event: DomainEvent): Promise<InvitationOutcome> {
    const { data, error } = await client.rpc('invite_member_with_event', {
        p_invitation_id: invitation.id,
        p_project_id: invitation.projectId,
        p_invitee_id: invitation.inviteeId,
        p_invited_by: invitation.invitedBy,
        p_event_id: event.id,
        p_event_name: event.name,
        p_occurred_at: event.occurredAt,
        p_payload: event.payload,
    });
    if (error) fail('invite', error);
    if (!OUTCOMES.has(data)) fail('invite', new Error('Invalid invitation outcome'));
    return data as InvitationOutcome;
}

async function pendingFor(client: InvitationClient, inviteeId: string): Promise<PendingInvitation[]> {
    const { data, error } = await client
        .from('project_invitations')
        .select('id, project_id, created_at, projects(name), inviter:users!project_invitations_invited_by_fkey(email)')
        .eq('invitee_id', inviteeId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
    if (error) fail('pendingFor', error);
    return (data ?? []).map(row => toPending(row as PendingRow));
}

export function createSupabaseInvitationRepository(settings: SupabaseSettings): InvitationRepository {
    const client: InvitationClient = serviceRoleClient(settings);

    return {
        async roleOf(projectId, userId) {
            const { data, error } = await client
                .from('project_memberships')
                .select('role')
                .eq('project_id', projectId)
                .eq('user_id', userId)
                .maybeSingle();
            if (error) fail('roleOf', error);
            return data === null ? undefined : asRole(data.role);
        },

        // Exact match: the address arrives in the canonical form of the
        // contracts, the form accounts were created with.
        async findAccountByEmail(email) {
            const { data, error } = await client.from('users').select('id').eq('email', email).maybeSingle();
            if (error) fail('findAccountByEmail', error);
            return data === null ? undefined : { id: data.id };
        },

        invite: (invitation, event) => invite(client, invitation, event),

        pendingFor: inviteeId => pendingFor(client, inviteeId),

        async respond({ invitationId, inviteeId, accept }) {
            const { data, error } = await client.rpc('respond_to_invitation', {
                p_invitation_id: invitationId,
                p_invitee_id: inviteeId,
                p_accept: accept,
            });
            if (error) fail('respond', error);
            if (!ANSWERS.has(data)) fail('respond', new Error('Invalid invitation answer'));
            return data as 'accepted' | 'declined' | 'not_found' | 'already_answered';
        },
    };
}
