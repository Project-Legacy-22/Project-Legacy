import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemPageDto, ItemsApi } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import type { NotificationDto, NotificationPageDto, NotificationsApi } from './api/notifications-api';
import { click, createReactTestRoot, flushTimers, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
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
