import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemsApi } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import type { NotificationsApi } from './api/notifications-api';
import { click, createReactTestRoot, getElement, setInputValue, submitForm } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
import { anItem } from './test/builders/item-builder';

const ACCOUNT: AccountDto = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };

let testRoot: ReactTestRoot;

function createApi(): ItemsApi {
    return {
        listItems: vi.fn(async () => ({ items: [anItem({})], nextCursor: null })),
        createItem: vi.fn(async () => anItem({})),
        updateItem: vi.fn(async () => anItem({})),
        deleteItem: vi.fn(async () => undefined),
    };
}

function createAuth(overrides: Partial<AuthApi> = {}): AuthApi {
    return {
        register: vi.fn(async () => undefined),
        signIn: vi.fn(async () => ACCOUNT),
        currentAccount: vi.fn(async () => ACCOUNT),
        requestPasswordReset: vi.fn(async () => undefined),
        resetPassword: vi.fn(async () => undefined),
        // Added by #174: the AuthApi facade makes it required.
        signOut: vi.fn(async () => undefined),
        ...overrides,
    };
}

function createNotifications(unread = 0): NotificationsApi {
    // listNotifications and markAsRead were added by #202: the facade requires
    // them, and this suite exercises neither.
    return {
        unreadCount: vi.fn(async () => unread),
        listNotifications: vi.fn(async () => ({ notifications: [], nextCursor: null })),
        markAsRead: vi.fn(async () => undefined),
    };
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('App privacy policy and consent', () => {
    async function openRegisterForm(register = vi.fn(async () => undefined)) {
        const auth = createAuth({ currentAccount: vi.fn(async () => null), register });
        await testRoot.render(
            <App api={createApi()} auth={auth} notifications={createNotifications()} />,
        );
        await click(getElement<HTMLButtonElement>('.button-quiet'));
        return register;
    }

    // Le critere de US-37 : la case n est jamais pre-cochee. Un consentement
    // pose d avance n en est pas un.
    it('n arrive jamais pre-cochee', async () => {
        await openRegisterForm();

        const box = getElement<HTMLInputElement>('input[type="checkbox"]');
        expect(box.checked).toBe(false);
        expect(box.getAttribute('aria-invalid')).toBe('false');
    });

    it('refuse l inscription sans consentement, sans appeler le serveur', async () => {
        const register = await openRegisterForm();
        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'ada@example.com');
        await setInputValue(
            getElement<HTMLInputElement>('input[type="password"]'),
            'un-mot-de-passe-valide',
        );

        await submitForm(getElement<HTMLFormElement>('form.auth-form'));

        expect(register).not.toHaveBeenCalled();
        const box = getElement<HTMLInputElement>('input[type="checkbox"]');
        expect(box.getAttribute('aria-invalid')).toBe('true');
    });

    // L erreur est rattachee au champ et annoncee : la case est en fin de
    // formulaire, donc le message peut apparaitre hors du champ de vision.
    it('rattache l erreur a la case et l annonce', async () => {
        await openRegisterForm();
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));

        const box = getElement<HTMLInputElement>('input[type="checkbox"]');
        const errorId = box.getAttribute('aria-describedby');
        const error = getElement<HTMLElement>(`#${errorId ?? ''}`);
        expect(error.getAttribute('role')).toBe('alert');
        expect(error.getAttribute('aria-live')).toBe('assertive');
    });

    it('associe une etiquette a la case', async () => {
        await openRegisterForm();

        const box = getElement<HTMLInputElement>('input[type="checkbox"]');
        expect(document.querySelector(`label[for="${box.id}"]`)).not.toBeNull();
    });

    it('ouvre la politique depuis le formulaire, sans compte', async () => {
        await openRegisterForm();

        await click(getElement<HTMLButtonElement>('.consent-policy-link'));

        expect(getElement<HTMLElement>('.policy-page h1').textContent).toBe('Privacy policy');
        expect(document.querySelector('form.auth-form')).toBeNull();
    });

    it('ouvre la politique depuis le pied de page', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await testRoot.render(
            <App api={createApi()} auth={auth} notifications={createNotifications()} />,
        );

        await click(getElement<HTMLButtonElement>('.site-footer .button-quiet'));

        expect(document.querySelector('.policy-page')).not.toBeNull();
    });
});
