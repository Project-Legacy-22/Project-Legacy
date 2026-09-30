import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { NotificationDto, NotificationsApi } from './api/notifications-api';
import type { ProjectDto, ProjectPageDto, ProjectsApi } from './api/projects-api';
import { labels } from './labels';
import {
    createApi,
    createAttentionApi,
    createAuth,
    createCredentialsApi,
    createMembersApi,
    createProjectsApi,
    itemPage,
    startAt,
} from './test/app-fixture';
import { anItem } from './test/builders/item-builder';
import { deferred } from './test/deferred';
import { click, createReactTestRoot, flushTimers, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

const CURRENT: ProjectDto = {
    id: '0191f3c2-1111-7000-8000-aaaaaaaaaaaa',
    name: 'Current project',
    role: 'owner',
    itemCount: 1,
};
const JOINED: ProjectDto = {
    id: '0191f3c2-2222-7000-8000-bbbbbbbbbbbb',
    name: 'Joined project',
    role: 'member',
    itemCount: 1,
};
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

const notifications: NotificationsApi = {
    unreadCount: async () => 1,
    listNotifications: async () => ({ notifications: [INVITATION], nextCursor: null }),
    markAsRead: async () => undefined,
};

let root: ReactTestRoot;

beforeEach(() => {
    root = createReactTestRoot();
    // The tasks it watches are in the projects view since #446.
    startAt('projects');
});

afterEach(async () => {
    await root.unmount();
});

describe('accepting an invitation while projects reload', () => {
    it('keeps the current tasks visible until the joined project is in the list', async () => {
        const nextPage = deferred<ProjectPageDto>();
        const listProjects: ProjectsApi['listProjects'] = vi.fn()
            .mockResolvedValueOnce({ projects: [CURRENT], nextCursor: null })
            .mockImplementationOnce(() => nextPage.promise);
        const listItems = vi.fn()
            .mockResolvedValueOnce(itemPage([anItem({ projectId: CURRENT.id, name: 'Work in progress' })]))
            .mockResolvedValueOnce(itemPage());

        await root.render(
            <App
                api={createApi({ listItems })}
                auth={createAuth()}
                credentials={createCredentialsApi()}
                attention={createAttentionApi()}
                projects={createProjectsApi({ listProjects })}
                notifications={notifications}
                members={createMembersApi()}
            />,
        );
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();

        await click(getElement<HTMLButtonElement>(`[aria-label="${labels.acceptInvitation(JOINED.name)}"]`));
        await flushTimers();

        expect(getElement('.todo-item').textContent).toContain('Work in progress');
        expect(document.querySelector('#no-project-heading')).toBeNull();

        nextPage.resolve({ projects: [JOINED, CURRENT], nextCursor: null });
        await flushTimers();

        expect(getElement(`[data-project-id="${JOINED.id}"] .project-select`).getAttribute('aria-pressed')).toBe('true');
    });
});
