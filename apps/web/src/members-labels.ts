import type { InvitationOutcome, NotificationKind, ProjectRole } from '@legacy/contracts';

// Wording of project members, invitations and notifications by kind (#401).
// Kept apart from labels.ts, which is at its line ceiling, and spread into it
// like the other label modules.

const ROLES: Record<ProjectRole, string> = { owner: 'Owner', member: 'Member' };

export const membersLabels = {
    membersTitle(projectName: string): string {
        return `Members of ${projectName}`;
    },
    showMembers: 'Show members',
    hideMembers: 'Hide members',
    loadingMembers: 'Loading members…',
    loadMembersFailed: 'Unable to load the members of this project.',
    invalidMemberList: 'The server returned an invalid member list.',
    emptyMembers: 'This project has no member.',
    emptyMembersReason: 'A project always keeps an owner, so this list fills again when it reloads.',
    memberRole(role: ProjectRole): string {
        return ROLES[role];
    },
    you: '(you)',
    removeMember(email: string): string {
        return `Remove ${email} from the project`;
    },
    confirmMemberRemoval(email: string, projectName: string): string {
        return `Remove ${email} from ${projectName}? Their tasks stay in the project.`;
    },
    memberRemoved(email: string): string {
        return `${email} was removed from the project.`;
    },
    removeMemberFailed: 'Unable to remove this member.',
    inviteEmailLabel: 'Invite by email address',
    inviteEmailHelp: 'The person needs an account. They join once they accept from their notifications.',
    inviteEmailInvalid: 'Enter a valid email address.',
    invite: 'Send invitation',
    inviting: 'Sending…',
    inviteFailed: 'Unable to send the invitation.',
    invitationOutcome(outcome: InvitationOutcome, email: string): string {
        if (outcome === 'already_member') return `${email} is already a member of this project.`;
        if (outcome === 'already_invited') return `${email} is already invited and has not answered yet.`;
        return `Invitation sent to ${email}.`;
    },

    notificationText(kind: NotificationKind, projectName: string | null): string {
        const project = projectName ?? 'a project that no longer exists';
        if (kind === 'membership.created') return `You were added to ${project}.`;
        if (kind === 'invitation.created') return `You are invited to join ${project}.`;
        return 'A new item was created.';
    },
    invitationAccepted: 'Accepted',
    invitationDeclined: 'Declined',
    acceptInvitation(projectName: string): string {
        return `Accept the invitation to ${projectName}`;
    },
    declineInvitation(projectName: string): string {
        return `Decline the invitation to ${projectName}`;
    },
    accept: 'Accept',
    decline: 'Decline',
    answeringInvitation: 'Sending your answer…',
    answerInvitationFailed: 'Unable to answer this invitation.',
    joinedProject(projectName: string): string {
        return `You joined ${projectName}.`;
    },
    declinedProject(projectName: string): string {
        return `You declined the invitation to ${projectName}.`;
    },

    // Assigning a task (US-58).
    assigneeLabel: 'Assigned to',
    nobody: 'Nobody',
    assignedTo(email: string | undefined): string {
        return email === undefined ? 'Assigned to a member' : `Assigned to ${email}`;
    },
    itemAssigned(itemName: string, email: string | undefined): string {
        return `${itemName} is now assigned to ${email ?? 'a member'}.`;
    },
    itemUnassigned(itemName: string): string {
        return `${itemName} is no longer assigned to anyone.`;
    },
} as const;
