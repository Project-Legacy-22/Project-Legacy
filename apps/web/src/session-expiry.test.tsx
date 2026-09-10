import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { ApiError } from './api/items-api';
import type { ItemPageDto, ItemsApi } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import type { NotificationsApi } from './api/notifications-api';
import { click, createReactTestRoot, flushTimers, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
import { anItem } from './test/builders/item-builder';
import { labels } from './labels';

// Ce que voit une personne dont la session se termine pendant qu elle
// travaille (US-27). L API renouvelle toute seule ce qui peut l etre, donc un
// 401 qui arrive jusqu au navigateur est definitif : il ne reste qu a le dire
// et a cesser d appeler.

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

// La suppression d un item est l action la plus courte qui parle a l API.
async function agirSurUnItem(): Promise<void> {
    await click(getElement<HTMLButtonElement>('.button-danger'));
    await flushTimers();
}

// use-notifications relit le compte toutes les deux secondes.
const RELECTURE_MS = 2_000;
const TROIS_RELECTURES_MS = 3 * RELECTURE_MS;

async function avancer(millisecondes: number): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(millisecondes);
    });
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
    vi.useRealTimers();
});

describe('session qui expire pendant l usage', () => {
    it('ramene a l ecran de connexion en disant que la session a expire', async () => {
        const api = itemsApi({
            deleteItem: vi.fn(() => Promise.reject(new ApiError(401, 'session expiree'))),
        });
        await testRoot.render(
            <App api={api} auth={authApi()} notifications={notificationsApi()} />,
        );

        await agirSurUnItem();

        expect(document.querySelector('form.auth-form')).not.toBeNull();
        expect(getElement<HTMLElement>('.auth-notice').textContent).toBe(labels.sessionExpired);
    });

    // Critere de l issue #28 : pas de cascade d erreurs. Le compte de
    // notifications se relit toutes les deux secondes ; une session finie doit
    // arreter cette relecture, pas la laisser frapper une API qui repondra 401
    // indefiniment.
    //
    // L horloge est simulee : avec la vraie, aucun intervalle ne se declenche
    // pendant un test, et l assertion passerait meme si rien ne l arretait.
    it('cesse de relire le compte de notifications des que la session est finie', async () => {
        vi.useFakeTimers();
        const notifications = notificationsApi();
        const api = itemsApi({
            deleteItem: vi.fn(() => Promise.reject(new ApiError(401, 'session expiree'))),
        });
        await testRoot.render(<App api={api} auth={authApi()} notifications={notifications} />);

        await avancer(TROIS_RELECTURES_MS);
        const pendantLaSession = vi.mocked(notifications.unreadCount).mock.calls.length;
        await click(getElement<HTMLButtonElement>('.button-danger'));
        await avancer(TROIS_RELECTURES_MS);

        // Une relecture a bien lieu tant que la session dure, sinon l assertion
        // suivante ne vaudrait rien.
        expect(pendantLaSession).toBeGreaterThan(1);
        expect(vi.mocked(notifications.unreadCount).mock.calls).toHaveLength(pendantLaSession);
    });

    // Le premier passage n a jamais eu de session : il n y a rien a expliquer,
    // et annoncer une expiration a un visiteur qui arrive serait faux.
    it('n annonce aucune expiration a un visiteur qui n a jamais eu de session', async () => {
        const auth = authApi();
        auth.currentAccount = vi.fn(async () => null);

        await testRoot.render(
            <App api={itemsApi()} auth={auth} notifications={notificationsApi()} />,
        );

        expect(document.querySelector('form.auth-form')).not.toBeNull();
        expect(document.querySelector('.auth-notice')).toBeNull();
    });
});
