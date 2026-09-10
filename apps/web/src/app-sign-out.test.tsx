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
    it('renvoie a l ecran de connexion et y deplace le focus', async () => {
        const signOut = vi.fn(async () => undefined);
        const auth = createAuth({ signOut });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await click(getElement<HTMLButtonElement>('.session-banner button'));
        await flushTimers();

        expect(signOut).toHaveBeenCalledOnce();
        expect(document.querySelector('.session-banner')).toBeNull();
        expect(document.querySelector('form.auth-form')).not.toBeNull();
        // Critere US-47 : le retour a l ecran de connexion deplace le focus
        // sur le titre.
        expect(document.activeElement).toBe(getElement<HTMLHeadingElement>('.auth-page h1'));
    });

    // La deconnexion doit fonctionner sur un poste partage meme si la
    // revocation cote serveur echoue : le cookie est efface quoi qu il arrive
    // (voir apps/api/src/http/routes/auth.ts).
    it('revient a l ecran de connexion meme si la requete echoue', async () => {
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
