import { invitationCreated } from '../domain/event.js';
import { AccountNotFound, NotProjectOwner } from '../domain/invitation.js';
import type { InvitationOutcome } from '../domain/invitation.js';
import { ProjectNotFound } from '../domain/project.js';
import type { InvitationRepository } from '../ports/invitation-repository.js';

export interface InviteProjectMemberDependencies {
    repository: InvitationRepository;
    newId: () => string;
    now: () => Date;
}

export interface Invitation {
    projectId: string;
    actorId: string;
    email: string;
}

export function makeInviteProjectMember({ repository, newId, now }: InviteProjectMemberDependencies) {
    return async function inviteProjectMember({ projectId, actorId, email }: Invitation): Promise<InvitationOutcome> {
        const role = await repository.roleOf(projectId, actorId);

        // A stranger must not learn the project exists; a member already knows,
        // so hiding the reason from them would protect nothing.
        if (role === undefined) throw new ProjectNotFound(projectId);
        if (role !== 'owner') throw new NotProjectOwner(projectId);

        const account = await repository.findAccountByEmail(email);
        if (account === undefined) throw new AccountNotFound();

        const invitationId = newId();
        const event = invitationCreated(newId(), now(), {
            invitationId,
            projectId,
            inviteeId: account.id,
            invitedBy: actorId,
        });

        // Inviting oneself, someone already in, or someone already invited
        // creates nothing and announces nothing: the outcome says which.
        return repository.invite({ id: invitationId, projectId, inviteeId: account.id, invitedBy: actorId }, event);
    };
}
