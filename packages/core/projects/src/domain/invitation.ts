import { ProjectError } from './project.js';

// Inviting a person into a project, and that person's answer (#401).

export type InvitationOutcome = 'invited' | 'already_member' | 'already_invited';
export type InvitationAnswer = 'accepted' | 'declined';

export interface NewInvitation {
    id: string;
    projectId: string;
    inviteeId: string;
    invitedBy: string;
}

// What the person invited reads before answering.
export interface PendingInvitation {
    id: string;
    projectId: string;
    projectName: string;
    invitedByEmail: string;
    createdAt: string;
}

export interface InvitationResponse {
    invitationId: string;
    inviteeId: string;
    accept: boolean;
}

// The caller is in the project but does not own it. 403 rather than 404: they
// already know the project exists, so hiding it protects nothing and would make
// the refusal unreadable.
export class NotProjectOwner extends ProjectError {
    constructor(readonly projectId: string) {
        super('not_project_owner', 403, 'Only an owner of this project can invite someone into it.');
    }
}

// No account carries that address.
//
// The refusal is explicit, deliberately: the owner must be able to correct a
// typo. That makes the route an account-existence oracle, bounded by the
// session and a rate limit per account -- and the alternative, a uniform
// answer as at registration, would make an invitation that went nowhere look
// like one that was sent.
//
// What exists nowhere, and must not: a route that lists or searches accounts.
// One types an address; one does not browse who is registered.
export class AccountNotFound extends ProjectError {
    constructor() {
        super('account_not_found', 404, 'No account uses this email address. Check it for a typo.');
    }
}

// An invitation that is not addressed to the caller does not exist for them,
// the same posture as a project they are not in.
export class InvitationNotFound extends ProjectError {
    constructor(readonly invitationId: string) {
        super('invitation_not_found', 404, 'This invitation does not exist or is not addressed to you.');
    }
}

export class InvitationAlreadyAnswered extends ProjectError {
    constructor(readonly invitationId: string) {
        super('invitation_already_answered', 409, 'This invitation has already been answered.');
    }
}
