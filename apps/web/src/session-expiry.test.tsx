import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { createProjectsApi, startAt } from './test/app-fixture';
import { ApiError } from './api/items-api';
import type { ItemPageDto, ItemsApi } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import type { NotificationsApi } from './api/notifications-api';
import { click, createReactTestRoot, flushTimers, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
import { anItem } from './test/builders/item-builder';
import { labels } from './labels';

// What a person sees when their session ends while they work (US-27). The API renews by itself
// whatever can be renewed, so a 401 that reaches the browser is final: all that remains is to say
// so and stop calling.

const COMPTE: AccountDto = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };
const ITEM = anItem({ id: '1c99b4ae-b7b8-49e7-885e-b2d976c1fe19', name: 'Premier item' });

let testRoot: ReactTestRoot;

function page(): ItemPageDto {
    return { items: [ITEM], nextCursor: null };
}

function itemsApi(overrides: Partial<ItemsApi> = {}): ItemsApi {
    return {
        listItems: vi.fn(async () => page()),
        createItem: vi.fn(async () => ITEM),
        updateItem: vi.fn(async () => ITEM),
        moveItem: vi.fn(async () => ITEM),
        reorderItem: vi.fn(async () => ITEM),
        deleteItem: vi.fn(async () => undefined),
        ...overrides,
    };
}

function authApi(): AuthApi {
    return {
        register: vi.fn(async () => undefined),
        signIn: vi.fn(async () => COMPTE),
        currentAccount: vi.fn(async () => COMPTE),
        requestPasswordReset: vi.fn(async () => undefined),
        resetPassword: vi.fn(async () => undefined),
    // Required by AuthApi since #174; this suite exercises expiry, not sign-out.
    signOut: vi.fn(async () => undefined),
    };
}

function notificationsApi(): NotificationsApi {
    return {
        unreadCount: vi.fn(async () => 0),
        // Required by NotificationsApi since #202.
        listNotifications: vi.fn(async () => ({ notifications: [], nextCursor: null })),
        markAsRead: vi.fn(async () => undefined),
    };
}

// Removing an item is the shortest action that talks to the API.
//
// Targeted by its accessible name and not by .button-danger: since #152 the page also carries the
// removal of a project, which comes earlier in the document.
async function agirSurUnItem(): Promise<void> {
    await click(getElement<HTMLButtonElement>(`[aria-label="${labels.removeItem(ITEM.name ?? labels.unnamedItem)}"]`));
    await flushTimers();
}

// use-notifications reads the count again every two seconds.
const RELECTURE_MS = 2_000;
const TROIS_RELECTURES_MS = 3 * RELECTURE_MS;

async function avancer(millisecondes: number): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(millisecondes);
    });
}

beforeEach(() => {
    testRoot = createReactTestRoot();
    startAt('projects');
    // Removing an item asks for confirmation since #176. jsdom does not implement confirm, which
    // then returns undefined: the action would be abandoned and the expected 401 would never come.
    vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(async () => {
    await testRoot.unmount();
    vi.useRealTimers();
});

describe('session expiring during use', () => {
    it('brings back the sign-in screen saying the session has expired', async () => {
        const api = itemsApi({
            deleteItem: vi.fn(() => Promise.reject(new ApiError(401, 'session expiree'))),
        });
        await testRoot.render(
            <App api={api} auth={authApi()} notifications={notificationsApi()} projects={createProjectsApi()} />,
        );

        await agirSurUnItem();

        expect(document.querySelector('form.auth-form')).not.toBeNull();
        expect(getElement<HTMLElement>('.auth-notice').textContent).toBe(labels.sessionExpired);
    });

    // Criterion of issue #28: no cascade of errors. The notification count is read again every two
    // seconds; an ended session must stop that reading, not let it hit an API that will answer 401
    // for ever.
    //
    // The clock is simulated: with the real one, no interval fires during a test, and the assertion
    // would pass even if nothing stopped it.
    it('stops reading the notification count again as soon as the session is over', async () => {
        vi.useFakeTimers();
        const notifications = notificationsApi();
        const api = itemsApi({
            deleteItem: vi.fn(() => Promise.reject(new ApiError(401, 'session expiree'))),
        });
        await testRoot.render(<App
                api={api}
                auth={authApi()}
                notifications={notifications}
                projects={createProjectsApi()}
            />);

        await avancer(TROIS_RELECTURES_MS);
        const pendantLaSession = vi.mocked(notifications.unreadCount).mock.calls.length;
        await click(getElement<HTMLButtonElement>(`[aria-label="${labels.removeItem(ITEM.name ?? labels.unnamedItem)}"]`));
        await avancer(TROIS_RELECTURES_MS);

        // A reading does happen while the session lasts, otherwise the next assertion would be
        // worth nothing.
        expect(pendantLaSession).toBeGreaterThan(1);
        expect(vi.mocked(notifications.unreadCount).mock.calls).toHaveLength(pendantLaSession);
    });

    // The first visit never had a session: there is nothing to explain, and announcing an expiry to
    // an arriving visitor would be false.
    it('announces no expiry to a visitor who never had a session', async () => {
        const auth = authApi();
        auth.currentAccount = vi.fn(async () => null);

        await testRoot.render(
            <App
                api={itemsApi()}
                auth={auth}
                notifications={notificationsApi()}
                projects={createProjectsApi()}
            />,
        );

        expect(document.querySelector('form.auth-form')).not.toBeNull();
        expect(document.querySelector('.auth-notice')).toBeNull();
    });
});
