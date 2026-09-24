import type { PendingInvitation } from '../domain/invitation.js';
import type { InvitationRepository } from '../ports/invitation-repository.js';

// The invitations waiting for the caller's answer. Scoped to the caller by
// construction: there is no parameter that could name someone else.
export function makeListInvitations(repository: InvitationRepository) {
    return function listInvitations(inviteeId: string): Promise<PendingInvitation[]> {
        return repository.pendingFor(inviteeId);
    };
}
