import { z } from 'zod';

import { EmailAddress } from './auth.js';

// Inviting a person into a project, and that person's answer (#401).

// An address and nothing else: the role of someone who accepts is always
// `member`, and letting the body choose it would let an owner mint a second
// owner by accident.
export const InviteMemberBody = z.object({
    email: EmailAddress,
});

// What happened, so the screen can say it: none of the three is a failure.
export const InvitationOutcome = z.enum(['invited', 'already_member', 'already_invited']);

export const InvitationOutcomeDto = z.object({
    outcome: InvitationOutcome,
});

export const InvitationIdParams = z.object({
    invitationId: z.uuid(),
});

// Who invites and into what, for the person invited. The inviter's address is
// shown because an invitation from an unnamed sender cannot be judged; it is
// the only address that crosses to someone outside the project, and the GDPR
// register says so.
export const PendingInvitationDto = z.object({
    id: z.uuid(),
    projectId: z.uuid(),
    projectName: z.string(),
    invitedByEmail: z.string(),
    createdAt: z.iso.datetime(),
});

export const PendingInvitationListDto = z.object({
    invitations: z.array(PendingInvitationDto),
});

export type InviteMemberBody = z.infer<typeof InviteMemberBody>;
export type InvitationOutcome = z.infer<typeof InvitationOutcome>;
export type InvitationOutcomeDto = z.infer<typeof InvitationOutcomeDto>;
export type InvitationIdParams = z.infer<typeof InvitationIdParams>;
export type PendingInvitationDto = z.infer<typeof PendingInvitationDto>;
export type PendingInvitationListDto = z.infer<typeof PendingInvitationListDto>;
