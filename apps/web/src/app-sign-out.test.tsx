import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import { ApiError } from './api/items-api';
import type { ItemPageDto, ItemsApi } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import { click, createReactTestRoot, flushTimers, getElement } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

let testRoot: ReactTestRoot;

function itemPage(): ItemPageDto {
    return { items: [], nextCursor: null };
}

function createApi(): ItemsApi {
    return {
        listItems: vi.fn(async () => itemPage()),
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

function createAuth(overrides: Partial<AuthApi> = {}): AuthApi {
    return {
        register: vi.fn(async () => undefined),
        signIn: vi.fn(async () => ACCOUNT),
        currentAccount: vi.fn(async () => ACCOUNT),
        requestPasswordReset: vi.fn(async () => undefined),
        resetPassword: vi.fn(async () => undefined),
        signOut: vi.fn(async () => undefined),
        ...overrides,
    };
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('App sign-out', () => {
    it('returns to the sign-in screen and moves the focus there', async () => {
        const signOut = vi.fn(async () => undefined);
        const auth = createAuth({ signOut });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await click(getElement<HTMLButtonElement>('.session-banner button'));
        await flushTimers();

        expect(signOut).toHaveBeenCalledOnce();
        expect(document.querySelector('.session-banner')).toBeNull();
        expect(document.querySelector('form.auth-form')).not.toBeNull();
        // US-47 criterion: returning to the sign-in screen moves the focus to the heading.
        expect(document.activeElement).toBe(getElement<HTMLHeadingElement>('.auth-page h1'));
    });

    // Signing out must work on a shared computer even if the revocation on the server fails: the
    // cookie is cleared whatever happens (see apps/api/src/http/routes/auth.ts).
    it('returns to the sign-in screen even if the request fails', async () => {
        const auth = createAuth({
            signOut: vi.fn(async () => {
                throw new ApiError(500, 'panne du fournisseur');
            }),
        });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await click(getElement<HTMLButtonElement>('.session-banner button'));
        await flushTimers();

        expect(document.querySelector('form.auth-form')).not.toBeNull();
    });
});
