import type { DomainEvent, InvitationRepository, PendingInvitation, ProjectRole } from '../../src/index.js';

export interface SeededAccount {
    id: string;
    email: string;
}

export interface SeededProjectMember {
    projectId: string;
    projectName: string;
    userId: string;
    role: ProjectRole;
}

interface StoredInvitation {
    id: string;
    projectId: string;
    inviteeId: string;
    invitedBy: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: string;
}

export interface InMemoryInvitationRepository extends InvitationRepository {
    invitations: StoredInvitation[];
    members: SeededProjectMember[];
    events: DomainEvent[];
}

// A real implementation of the port over arrays, applying the rules of the
// database functions: one pending invitation per person and project, a member
// is not invited, only the person invited answers, an answer is given once,
// accepting adds a member.
export function inMemoryInvitationRepository(
    accounts: readonly SeededAccount[],
    seeded: readonly SeededProjectMember[],
    now: () => string = () => '2026-09-24T09:00:00.000Z',
): InMemoryInvitationRepository {
    const members = seeded.map(member => ({ ...member }));
    const invitations: StoredInvitation[] = [];
    const events: DomainEvent[] = [];
    const nameOf = (projectId: string) => members.find(member => member.projectId === projectId)?.projectName ?? '';
    const emailOf = (userId: string) => accounts.find(account => account.id === userId)?.email ?? '';

    return {
        invitations,
        members,
        events,

        roleOf(projectId, userId) {
            return Promise.resolve(
                members.find(member => member.projectId === projectId && member.userId === userId)?.role,
            );
        },

        findAccountByEmail(email) {
            const account = accounts.find(candidate => candidate.email === email);
            return Promise.resolve(account === undefined ? undefined : { id: account.id });
        },

        invite(invitation, event) {
            if (members.some(member => member.projectId === invitation.projectId && member.userId === invitation.inviteeId)) {
                return Promise.resolve('already_member');
            }
            const pending = invitations.some(
                stored =>
                    stored.projectId === invitation.projectId &&
                    stored.inviteeId === invitation.inviteeId &&
                    stored.status === 'pending',
            );
            if (pending) return Promise.resolve('already_invited');

            invitations.push({ ...invitation, status: 'pending', createdAt: now() });
            events.push(event);
            return Promise.resolve('invited');
        },

        pendingFor(inviteeId) {
            const pending: PendingInvitation[] = invitations
                .filter(stored => stored.inviteeId === inviteeId && stored.status === 'pending')
                .map(stored => ({
                    id: stored.id,
                    projectId: stored.projectId,
                    projectName: nameOf(stored.projectId),
                    invitedByEmail: emailOf(stored.invitedBy),
                    createdAt: stored.createdAt,
                }));
            return Promise.resolve(pending.reverse());
        },

        respond({ invitationId, inviteeId, accept }) {
            const stored = invitations.find(candidate => candidate.id === invitationId && candidate.inviteeId === inviteeId);
            if (stored === undefined) return Promise.resolve('not_found');
            if (stored.status !== 'pending') return Promise.resolve('already_answered');

            stored.status = accept ? 'accepted' : 'declined';
            if (!accept) return Promise.resolve('declined');

            members.push({ projectId: stored.projectId, projectName: nameOf(stored.projectId), userId: inviteeId, role: 'member' });
            return Promise.resolve('accepted');
        },
    };
}
