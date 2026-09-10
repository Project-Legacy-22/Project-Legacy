import { act } from 'react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemPageDto, ItemsApi } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import type { NotificationDto, NotificationPageDto, NotificationsApi } from './api/notifications-api';
import { click, createReactTestRoot, flushTimers, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
import { labels } from './labels';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve: Deferred<T>['resolve'] = () => {
        throw new Error('Deferred promise was not initialized.');
    };
    const promise = new Promise<T>(promiseResolve => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

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
    itemId: '22222222-2222-4222-8222-222222222222',
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
    it('est repliee par defaut et ne demande pas la liste', async () => {
        const listNotifications = vi.fn(async (): Promise<NotificationPageDto> => ({
            notifications: [],
            nextCursor: null,
        }));
        const notifications = createNotifications({ listNotifications });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        expect(document.querySelector('#notifications-panel-content')).toBeNull();
        expect(listNotifications).not.toHaveBeenCalled();
    });

    it('demande et affiche la liste a l ouverture', async () => {
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

    it('affiche un etat vide quand il n y a rien', async () => {
        const notifications = createNotifications();
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();

        expect(document.querySelector('.empty-message')?.textContent).toBe(labels.emptyNotifications);
    });

    it('se replie a un second clic, sans redemander la liste', async () => {
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

    it('marque une notification comme lue et retire le bouton', async () => {
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

    it('charge la page suivante et l annonce', async () => {
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

    it('signale un echec de chargement de la liste', async () => {
        const notifications = createNotifications({
            listNotifications: vi.fn(async () => {
                throw new Error('panne du serveur');
            }),
        });
        await testRoot.render(<App api={createApi()} auth={createAuth()} notifications={notifications} />);

        await click(getElement<HTMLButtonElement>('.notifications-panel button'));
        await flushTimers();

        expect(getElement<HTMLElement>('#notifications-panel-content [role="alert"]').textContent).toBe(
            labels.loadNotificationsFailed,
        );
    });

    it('signale un echec de chargement de la suite, avec un bouton pour ressayer', async () => {
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

    it('signale un echec de marquage comme lu, sans retirer le bouton', async () => {
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

    it('n ajoute pas une page perimee quand le panneau est ferme puis rouvert pendant un chargement de suite', async () => {
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
