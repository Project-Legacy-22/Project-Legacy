import { act } from 'react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemPageDto, ItemsApi } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import type { NotificationDto, NotificationPageDto, NotificationsApi } from './api/notifications-api';
import { click, createReactTestRoot, flushTimers, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
import { deferred } from './test/deferred';
import { labels } from './labels';

let testRoot: ReactTestRoot;

function createApi(): ItemsApi {
    return {
        listItems: vi.fn(async (): Promise<ItemPageDto> => ({ items: [], nextCursor: null })),
        createItem: vi.fn(async () => {
            throw new Error('not exercised by this suite');
        }),
        updateItem: vi.fn(async () => {
            throw new Error('not exercised by this suite');
        }),
        moveItem: vi.fn(async () => {
            throw new Error('not exercised by this suite');
        }),
        reorderItem: vi.fn(async () => {
            throw new Error('not exercised by this suite');
        }),
        deleteItem: vi.fn(async () => undefined),
    };
}

const ACCOUNT: AccountDto = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };

function createAuth(): AuthApi {
    return {
        register: vi.fn(async () => undefined),
        signIn: vi.fn(async () => ACCOUNT),
        currentAccount: vi.fn(async () => ACCOUNT),
        requestPasswordReset: vi.fn(async () => undefined),
        resetPassword: vi.fn(async () => undefined),
        signOut: vi.fn(async () => undefined),
    };
}

const NOTIFICATION: NotificationDto = {
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'item.created',
    itemId: '22222222-2222-4222-8222-222222222222',
    projectId: null,
    projectName: null,
    invitationId: null,
    invitationStatus: null,
    readAt: null,
    createdAt: '2026-09-10T10:00:00.000Z',
};

function createNotifications(overrides: Partial<NotificationsApi> = {}): NotificationsApi {
    return {
        unreadCount: vi.fn(async () => 0),
        listNotifications: vi.fn(async (): Promise<NotificationPageDto> => ({
            notifications: [],
            nextCursor: null,
        })),
        markAsRead: vi.fn(async () => undefined),
        ...overrides,
    };
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('App notifications panel', () => {
    it('is folded by default and does not ask for the list', async () => {
        const listNotifications = vi.fn(async (): Promise<NotificationPageDto> => ({
            notifications: [],
            nextCursor: null,
        }));
        const notifications = createNotifications({ listNotifications });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        expect(document.querySelector('#notifications-panel-content')).toBeNull();
        expect(listNotifications).not.toHaveBeenCalled();
    });

    it('asks for and shows the list when opened', async () => {
        const notifications = createNotifications({
            listNotifications: vi.fn(async (): Promise<NotificationPageDto> => ({
                notifications: [NOTIFICATION],
                nextCursor: null,
            })),
        });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();

        expect(document.querySelectorAll('.notification-row')).toHaveLength(1);
        expect(document.querySelector('#notifications-panel-content')).not.toBeNull();
    });

    it('shows an empty state when there is nothing', async () => {
        const notifications = createNotifications();
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();

        expect(document.querySelector('.empty-message')?.textContent).toBe(labels.emptyNotifications);
    });

    it('exposes loading on the panel, and not only as text', async () => {
        // A delayed answer, otherwise the loading state is already over when the click is awaited
        // and cannot be observed.
        const page = deferred<NotificationPageDto>();
        const notifications = createNotifications({
            listNotifications: vi.fn(() => page.promise),
        });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        expect(getElement<HTMLElement>('.notifications-panel').getAttribute('aria-busy')).toBe('true');

        page.resolve({ notifications: [], nextCursor: null });
        await flushTimers();

        expect(getElement<HTMLElement>('.notifications-panel').getAttribute('aria-busy')).toBe('false');
    });

    it('folds on a second click, without asking for the list again', async () => {
        const listNotifications = vi.fn(async (): Promise<NotificationPageDto> => ({
            notifications: [],
            nextCursor: null,
        }));
        const notifications = createNotifications({ listNotifications });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        const toggle = getElement<HTMLButtonElement>('.notifications-panel button');
        await click(toggle);
        await flushTimers();
        await click(toggle);

        expect(document.querySelector('#notifications-panel-content')).toBeNull();
        expect(listNotifications).toHaveBeenCalledOnce();
    });

    it('marks a notification as read and removes the button', async () => {
        const markAsRead = vi.fn(async () => undefined);
        const notifications = createNotifications({
            listNotifications: vi.fn(async (): Promise<NotificationPageDto> => ({
                notifications: [NOTIFICATION],
                nextCursor: null,
            })),
            markAsRead,
        });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.notification-row button'));
        await flushTimers();

        expect(markAsRead).toHaveBeenCalledWith(NOTIFICATION.id);
        expect(document.querySelector('.notification-row button')).toBeNull();
        expect(getElement<HTMLElement>('.notification-status').textContent).toBe(labels.notificationRead);
    });

    it('loads the next page and announces it', async () => {
        const secondNotification: NotificationDto = {
            ...NOTIFICATION,
            id: '33333333-3333-4333-8333-333333333333',
        };
        const listNotifications = vi
            .fn<NotificationsApi['listNotifications']>()
            .mockResolvedValueOnce({ notifications: [NOTIFICATION], nextCursor: 'a-cursor' })
            .mockResolvedValueOnce({ notifications: [secondNotification], nextCursor: null });
        const notifications = createNotifications({ listNotifications });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.notifications-pagination button'));
        await flushTimers();

        expect(listNotifications).toHaveBeenLastCalledWith(
            expect.objectContaining({ cursor: 'a-cursor' }),
        );
        expect(document.querySelectorAll('.notification-row')).toHaveLength(2);
        expect(document.querySelector('.pagination-status')?.textContent).toBe(
            labels.notificationsLoaded(1),
        );
    });

    it('reports a failure to load the list and sends the request again', async () => {
        const listNotifications = vi.fn(async () => {
            throw new Error('panne du serveur');
        });
        const notifications = createNotifications({ listNotifications });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();

        const alerte = getElement<HTMLElement>('#notifications-panel-content [role="alert"]');
        expect(alerte.querySelector('p')?.textContent).toBe(labels.loadNotificationsFailed);

        // The EN-48 criterion is not that a button exists, it is that it sends the request again.
        // The panel had none: the only way out was to close and reopen it, which nothing said.
        const appelsAvant = listNotifications.mock.calls.length;
        await click(getElement<HTMLButtonElement>('[role="alert"] button'));
        await flushTimers();

        expect(listNotifications.mock.calls.length).toBeGreaterThan(appelsAvant);
    });

    it('reports a failure to load more, with a button to try again', async () => {
        const listNotifications = vi
            .fn<NotificationsApi['listNotifications']>()
            .mockResolvedValueOnce({ notifications: [NOTIFICATION], nextCursor: 'a-cursor' })
            .mockRejectedValueOnce(new Error('panne du serveur'));
        const notifications = createNotifications({ listNotifications });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.notifications-pagination button'));
        await flushTimers();

        expect(getElement<HTMLElement>('.pagination-error').textContent).toBe(
            labels.loadMoreNotificationsFailed,
        );
        expect(getElement<HTMLButtonElement>('.notifications-pagination button').textContent).toBe(
            labels.retryLoadingMoreNotifications,
        );
    });

    it('reports a failure to mark as read, without removing the button', async () => {
        const notifications = createNotifications({
            listNotifications: vi.fn(async (): Promise<NotificationPageDto> => ({
                notifications: [NOTIFICATION],
                nextCursor: null,
            })),
            markAsRead: vi.fn(async () => {
                throw new Error('panne du serveur');
            }),
        });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.notification-row button'));
        await flushTimers();

        expect(getElement<HTMLElement>('#notifications-panel-content [role="alert"]').textContent).toBe(
            labels.markNotificationReadFailed,
        );
        expect(document.querySelector('.notification-row button')).not.toBeNull();
    });

    it('does not add a stale page when the panel is closed and reopened while loading more', async () => {
        const staleNext = deferred<NotificationPageDto>();
        const secondNotification: NotificationDto = {
            ...NOTIFICATION,
            id: '33333333-3333-4333-8333-333333333333',
            createdAt: '2026-09-10T12:00:00.000Z',
        };
        const listNotifications = vi
            .fn<NotificationsApi['listNotifications']>()
            .mockResolvedValueOnce({ notifications: [NOTIFICATION], nextCursor: 'a-cursor' })
            .mockImplementationOnce(() => staleNext.promise)
            .mockResolvedValueOnce({ notifications: [secondNotification], nextCursor: null });
        const notifications = createNotifications({ listNotifications });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        const toggle = getElement<HTMLButtonElement>('.notifications-panel button');
        await click(toggle);
        await flushTimers();
        await click(getElement<HTMLButtonElement>('.notifications-pagination button'));
        await click(toggle);
        await click(toggle);
        await flushTimers();

        await act(async () => {
            staleNext.resolve({ notifications: [NOTIFICATION], nextCursor: null });
            await staleNext.promise;
        });
        await flushTimers();

        expect(document.querySelectorAll('.notification-row')).toHaveLength(1);
        expect(document.querySelector('.notification-row')?.textContent).toContain(
            new Date(secondNotification.createdAt).toLocaleString(),
        );
    });

    it('has no automatically detectable WCAG A or AA violation with the panel open', async () => {
        document.documentElement.lang = 'en';
        document.title = 'Todo list | Legacy 22';
        const notifications = createNotifications({
            listNotifications: vi.fn(async (): Promise<NotificationPageDto> => ({
                notifications: [NOTIFICATION],
                nextCursor: 'a-cursor',
            })),
        });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();

        const results = await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
            // axe documents that this rule cannot produce reliable results in jsdom.
            rules: { 'color-contrast': { enabled: false } },
        });

        expect(results.violations.map(violation => violation.id)).toEqual([]);
    });
});
