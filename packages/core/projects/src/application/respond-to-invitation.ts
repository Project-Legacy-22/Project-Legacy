import { InvitationAlreadyAnswered, InvitationNotFound } from '../domain/invitation.js';
import type { InvitationAnswer, InvitationResponse } from '../domain/invitation.js';
import type { InvitationRepository } from '../ports/invitation-repository.js';

// Accepts or declines. The check that the caller is the person invited lives in
// the database function, in the same statement as the answer, so no read can
// go stale between the check and the write.
export function makeRespondToInvitation(repository: InvitationRepository) {
    return async function respondToInvitation(response: InvitationResponse): Promise<InvitationAnswer> {
        const outcome = await repository.respond(response);

        if (outcome === 'not_found') throw new InvitationNotFound(response.invitationId);
        if (outcome === 'already_answered') throw new InvitationAlreadyAnswered(response.invitationId);
        return outcome;
    };
}
