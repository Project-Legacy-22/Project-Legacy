import type { DomainEvent } from '../domain/event.js';
import type { NewInvitation, InvitationOutcome, PendingInvitation, InvitationResponse } from '../domain/invitation.js';
import type { ProjectRole } from '../domain/project.js';

// Everything an invitation needs from storage (#401). The adapter uses the
// service role, like the membership one: authorization is decided in the use
// cases, and for an answer by the database function as well.
export interface InvitationRepository {
    // The caller's role, or undefined when they are not in the project. Two
    // answers because the refusal differs: a member who is not an owner gets
    // 403, a stranger gets 404.
    roleOf(projectId: string, userId: string): Promise<ProjectRole | undefined>;
    // Resolves an address to an account. It exists for inviting only: it is not
    // a lookup, and nothing exposes it as one.
    findAccountByEmail(email: string): Promise<{ id: string } | undefined>;
    // The invitation and its event, written together or not at all.
    invite(invitation: NewInvitation, event: DomainEvent): Promise<InvitationOutcome>;
    // The invitations waiting for this person's answer, newest first.
    pendingFor(inviteeId: string): Promise<PendingInvitation[]>;
    // Records the answer; accepting adds the membership in the same transaction.
    respond(response: InvitationResponse): Promise<'accepted' | 'declined' | 'not_found' | 'already_answered'>;
}
