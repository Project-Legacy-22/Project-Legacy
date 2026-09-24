import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { ApiError } from './api/items-api';
import type { MembersApi, ProjectMemberDto } from './api/members-api';
import type { NotificationDto, NotificationsApi } from './api/notifications-api';
import type { ProjectDto, ProjectsApi } from './api/projects-api';
import { labels } from './labels';
import {
    ACCOUNT,
    createApi,
    createAttentionApi,
    createAuth,
    createCredentialsApi,
    createMembersApi,
    createProjectsApi,
} from './test/app-fixture';
import { click, createReactTestRoot, flushTimers, getElement, setInputValue, submitForm } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

// #401 from the interface: the person invited answers from the notification,
// and an owner sees the members of a project, invites and removes.

const OWN_PROJECT: ProjectDto = { id: '0191f3c2-1111-7000-8000-aaaaaaaaaaaa', name: 'My project', role: 'owner', itemCount: 0 };
const JOINED: ProjectDto = { id: '0191f3c2-2222-7000-8000-bbbbbbbbbbbb', name: 'Launch', role: 'member', itemCount: 3 };
const GUEST: ProjectMemberDto = { userId: '0191f3c2-aaaa-7000-8000-000000000002', email: 'guest@example.com', role: 'member' };
const ME: ProjectMemberDto = { userId: ACCOUNT.id, email: ACCOUNT.email, role: 'owner' };

const INVITATION: NotificationDto = {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'invitation.created',
    itemId: null,
    projectId: JOINED.id,
    projectName: JOINED.name,
    invitationId: '33333333-3333-4333-8333-333333333333',
    invitationStatus: 'pending',
    readAt: null,
    createdAt: '2026-09-24T10:00:00.000Z',
};

let testRoot: ReactTestRoot;

function notificationsWith(notifications: NotificationDto[]): NotificationsApi & { markAsRead: ReturnType<typeof vi.fn> } {
    return {
        unreadCount: vi.fn(async () => notifications.length),
        listNotifications: vi.fn(async () => ({ notifications, nextCursor: null })),
        markAsRead: vi.fn(async () => undefined),
    };
}

interface Doubles {
    notifications?: NotificationsApi;
    members?: MembersApi;
    projects?: ProjectsApi;
}

async function renderApp(doubles: Doubles): Promise<void> {
    await testRoot.render(
        <App
            api={createApi()}
            auth={createAuth()}
            credentials={createCredentialsApi()}
            attention={createAttentionApi()}
            projects={doubles.projects ?? createProjectsApi({ listProjects: async () => ({ projects: [OWN_PROJECT], nextCursor: null }) })}
            notifications={doubles.notifications ?? notificationsWith([])}
            members={doubles.members ?? createMembersApi()}
        />,
    );
    await flushTimers();
}

async function openNotifications(): Promise<void> {
    await click(getElement<HTMLButtonElement>('.notifications-panel button'));
    await flushTimers();
}

async function openMembers(): Promise<void> {
    await click(getElement<HTMLButtonElement>('.members-panel button[aria-controls="members-content"]'));
    await flushTimers();
}

function buttonNamed(name: string): HTMLButtonElement {
    const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        button => (button.getAttribute('aria-label') ?? button.textContent) === name,
    );
    if (found === undefined) throw new Error(`no button named ${name}`);
    return found;
}

function politeText(): string {
    return [...document.querySelectorAll('[aria-live="polite"]')].map(region => region.textContent).join(' ');
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    vi.unstubAllGlobals();
    await testRoot.unmount();
});

describe('answering an invitation from its notification', () => {
    it('words each kind of notification', async () => {
        const added: NotificationDto = { ...INVITATION, id: '44444444-4444-4444-8444-444444444444', kind: 'membership.created', invitationId: null, invitationStatus: null };
        await renderApp({ notifications: notificationsWith([INVITATION, added]) });

        await openNotifications();

        const rows = [...document.querySelectorAll('.notification-row p')].map(row => row.textContent);
        expect(rows[0]).toContain(labels.notificationText('invitation.created', 'Launch'));
        expect(rows[1]).toContain(labels.notificationText('membership.created', 'Launch'));
    });

    it('joins on accept: the answer is sent, shown, announced, and the project appears', async () => {
        const answerInvitation = vi.fn(async () => undefined);
        const notifications = notificationsWith([INVITATION]);
        let joined = false;
        const listProjects = vi.fn(async () => ({ projects: joined ? [JOINED, OWN_PROJECT] : [OWN_PROJECT], nextCursor: null }));
        await renderApp({ notifications, members: createMembersApi({ answerInvitation }), projects: createProjectsApi({ listProjects }) });
        await openNotifications();

        joined = true;
        await click(buttonNamed(labels.acceptInvitation('Launch')));
        await flushTimers();

        expect(answerInvitation).toHaveBeenCalledWith(INVITATION.invitationId, true);
        expect(document.querySelector('.notification-row')?.textContent).toContain(labels.invitationAccepted);
        expect(document.querySelector('.notification-answer')).toBeNull();
        expect(politeText()).toContain(labels.joinedProject('Launch'));
        expect(notifications.markAsRead).toHaveBeenCalledWith(INVITATION.id);
        expect(getElement(`[data-project-id="${JOINED.id}"] .project-select`).getAttribute('aria-pressed')).toBe('true');
    });

    it('stays out on decline, and says so', async () => {
        const answerInvitation = vi.fn(async () => undefined);
        await renderApp({ notifications: notificationsWith([INVITATION]), members: createMembersApi({ answerInvitation }) });
        await openNotifications();

        await click(buttonNamed(labels.declineInvitation('Launch')));
        await flushTimers();

        expect(answerInvitation).toHaveBeenCalledWith(INVITATION.invitationId, false);
        expect(document.querySelector('.notification-row')?.textContent).toContain(labels.invitationDeclined);
        expect(politeText()).toContain(labels.declinedProject('Launch'));
        expect(document.querySelector(`[data-project-id="${JOINED.id}"]`)).toBeNull();
    });

    it('shows the refusal of an invitation already answered, and keeps the choice open', async () => {
        const detail = 'This invitation has already been answered.';
        const answerInvitation = vi.fn(async () => {
            throw new ApiError(409, detail);
        });
        await renderApp({ notifications: notificationsWith([INVITATION]), members: createMembersApi({ answerInvitation }) });
        await openNotifications();

        await click(buttonNamed(labels.acceptInvitation('Launch')));
        await flushTimers();

        expect(document.querySelector('#notifications-panel-content [role="alert"]')?.textContent).toBe(detail);
        expect(buttonNamed(labels.acceptInvitation('Launch')).disabled).toBe(false);
    });

    it('offers no answer on an invitation already answered', async () => {
        await renderApp({ notifications: notificationsWith([{ ...INVITATION, invitationStatus: 'accepted', readAt: INVITATION.createdAt }]) });

        await openNotifications();

        expect(document.querySelector('.notification-answer')).toBeNull();
        expect(document.querySelector('.notification-row')?.textContent).toContain(labels.invitationAccepted);
    });
});

describe('the members of a project', () => {
    it('are listed with their role once the panel is opened', async () => {
        const listMembers = vi.fn(async () => [ME, GUEST]);
        await renderApp({ members: createMembersApi({ listMembers }) });

        // Read once already, for the assignment choice of the tasks (US-58),
        // but the panel shows nothing until it is opened.
        expect(document.querySelector('#members-list')).toBeNull();
        const readsBefore = listMembers.mock.calls.length;
        await openMembers();

        expect(listMembers).toHaveBeenCalledTimes(readsBefore + 1);
        expect(listMembers).toHaveBeenLastCalledWith(OWN_PROJECT.id, expect.any(AbortSignal));
        const rows = [...document.querySelectorAll('#members-list li')].map(row => row.textContent);
        expect(rows[0]).toContain(`${ACCOUNT.email} ${labels.you}`);
        expect(rows[1]).toContain(labels.memberRole('member'));
        expect(document.querySelectorAll('#members-list button')).toHaveLength(1);
        const results = await axe.run(getElement('.members-panel'));
        expect(results.violations).toEqual([]);
    });

    it('refuses an address that is not one, without asking the server', async () => {
        const invite = vi.fn(async () => 'invited' as const);
        await renderApp({ members: createMembersApi({ invite }) });
        await openMembers();

        await setInputValue(getElement<HTMLInputElement>('#invite-email'), 'not an address');
        await submitForm(getElement<HTMLFormElement>('.members-panel form'));

        expect(invite).not.toHaveBeenCalled();
        expect(getElement('#invite-email-error').textContent).toBe(labels.inviteEmailInvalid);
        expect(getElement('#invite-email').getAttribute('aria-invalid')).toBe('true');
    });

    it('invites by address and announces what happened', async () => {
        const invite = vi.fn(async () => 'already_invited' as const);
        await renderApp({ members: createMembersApi({ invite }) });
        await openMembers();

        await setInputValue(getElement<HTMLInputElement>('#invite-email'), ' Guest@Example.com ');
        await submitForm(getElement<HTMLFormElement>('.members-panel form'));
        await flushTimers();

        expect(invite).toHaveBeenCalledWith(OWN_PROJECT.id, 'guest@example.com');
        expect(politeText()).toContain(labels.invitationOutcome('already_invited', 'guest@example.com'));
        expect(getElement<HTMLInputElement>('#invite-email').value).toBe('');
    });

    it('keeps the address and shows why when no account uses it', async () => {
        const detail = 'No account uses this email address. Check it for a typo.';
        const invite = vi.fn(async () => {
            throw new ApiError(404, detail);
        });
        await renderApp({ members: createMembersApi({ invite }) });
        await openMembers();

        await setInputValue(getElement<HTMLInputElement>('#invite-email'), 'nobody@example.com');
        await submitForm(getElement<HTMLFormElement>('.members-panel form'));
        await flushTimers();

        expect(getElement('#invite-email-error').textContent).toBe(detail);
        expect(getElement<HTMLInputElement>('#invite-email').value).toBe('nobody@example.com');
    });

    it('removes a member after confirmation', async () => {
        const removeMember = vi.fn(async () => undefined);
        vi.stubGlobal('confirm', vi.fn(() => true));
        await renderApp({ members: createMembersApi({ listMembers: async () => [ME, GUEST], removeMember }) });
        await openMembers();

        await click(buttonNamed(labels.removeMember(GUEST.email)));
        await flushTimers();

        expect(removeMember).toHaveBeenCalledWith(OWN_PROJECT.id, GUEST.userId);
        expect(document.querySelectorAll('#members-list li')).toHaveLength(1);
        expect(politeText()).toContain(labels.memberRemoved(GUEST.email));
    });

    it('says why the list failed, and loads it again on retry', async () => {
        let attempts = 0;
        const listMembers = vi.fn(async () => {
            attempts += 1;
            // The first read is the assignment choice's (US-58); the second
            // is the panel's, and it is the one that fails.
            if (attempts === 2) throw new ApiError(503, 'The service is temporarily unavailable. Try again in a moment.');
            return [ME];
        });
        await renderApp({ members: createMembersApi({ listMembers }) });
        await openMembers();

        expect(getElement('.members-panel [role="alert"]').textContent).toContain('temporarily unavailable');
        await click(buttonNamed(labels.retry));
        await flushTimers();

        expect(document.querySelectorAll('#members-list li')).toHaveLength(1);
    });

    it('keeps a member whose removal was refused, and says why', async () => {
        const removeMember = vi.fn(async () => {
            throw new TypeError('offline');
        });
        vi.stubGlobal('confirm', vi.fn(() => true));
        await renderApp({ members: createMembersApi({ listMembers: async () => [ME, GUEST], removeMember }) });
        await openMembers();

        await click(buttonNamed(labels.removeMember(GUEST.email)));
        await flushTimers();

        expect(document.querySelectorAll('#members-list li')).toHaveLength(2);
        expect(getElement('.members-panel .action-error').textContent).toBe(labels.removeMemberFailed);
    });

    it('removes nobody when the confirmation is dismissed', async () => {
        const removeMember = vi.fn(async () => undefined);
        vi.stubGlobal('confirm', vi.fn(() => false));
        await renderApp({ members: createMembersApi({ listMembers: async () => [ME, GUEST], removeMember }) });
        await openMembers();

        await click(buttonNamed(labels.removeMember(GUEST.email)));

        expect(removeMember).not.toHaveBeenCalled();
    });

    it('falls back to its own sentence when the invitation fails without an answer', async () => {
        const invite = vi.fn(async () => {
            throw new TypeError('offline');
        });
        await renderApp({ members: createMembersApi({ invite }) });
        await openMembers();

        await setInputValue(getElement<HTMLInputElement>('#invite-email'), 'guest@example.com');
        await submitForm(getElement<HTMLFormElement>('.members-panel form'));
        await flushTimers();

        expect(getElement('#invite-email-error').textContent).toBe(labels.inviteFailed);
    });

    it('shows a member the list, with neither invitation nor removal', async () => {
        await renderApp({
            projects: createProjectsApi({ listProjects: async () => ({ projects: [JOINED], nextCursor: null }) }),
            members: createMembersApi({ listMembers: async () => [{ ...ME, role: 'member' }, { ...GUEST, email: 'owner@example.com', role: 'owner' }] }),
        });
        await openMembers();

        expect(document.querySelectorAll('#members-list li')).toHaveLength(2);
        expect(document.querySelector('#invite-email')).toBeNull();
        expect(document.querySelectorAll('#members-list button')).toHaveLength(0);
    });
});
