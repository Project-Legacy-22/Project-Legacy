import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemPageDto, ItemsApi } from './api/items-api';
import { ApiError } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import type { CredentialsApi } from './api/credentials-api';
import type { NotificationsApi } from './api/notifications-api';
import type { ProjectsApi } from './api/projects-api';
import {
    click,
    createReactTestRoot,
    flushTimers,
    getElement,
    setInputValue,
    submitForm,
    waitFor,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
import { deferred } from './test/deferred';
import {
    ACCOUNT,
    createApi,
    createAuth,
    createCredentialsApi,
    createProjectsApi,
    firstItem,
    itemPage,
    secondItem,
    startAt,
} from './test/app-fixture';
import { labels } from './labels';

let testRoot: ReactTestRoot;

// Signed in by default: the item tests below are about the item workflow, and
// making each of them sign in first would test the session over and over.
function createNotifications(unread = 0): NotificationsApi {
    return {
        unreadCount: vi.fn(async () => unread),
        listNotifications: vi.fn(async () => ({ notifications: [], nextCursor: null })),
        markAsRead: vi.fn(async () => undefined),
    };
}

interface AppFixture {
    api?: ItemsApi;
    auth?: AuthApi;
    credentials?: CredentialsApi;
    projects?: ProjectsApi;
    notifications?: NotificationsApi;
}

function renderApp(fixture: AppFixture = {}): Promise<void> {
    return testRoot.render(
        <App
            api={fixture.api ?? createApi()}
            auth={fixture.auth ?? createAuth()}
            credentials={fixture.credentials ?? createCredentialsApi()}
            projects={fixture.projects ?? createProjectsApi()}
            notifications={fixture.notifications ?? createNotifications()}
        />,
    );
}

async function fillSignInForm(email: string, password: string): Promise<void> {
    const [emailInput, passwordInput] = [
        getElement<HTMLInputElement>('input[type="email"]'),
        getElement<HTMLInputElement>('input[type="password"]'),
    ];
    await setInputValue(emailInput, email);
    await setInputValue(passwordInput, password);
    await submitForm(getElement<HTMLFormElement>('form.auth-form'));
}

beforeEach(() => {
    testRoot = createReactTestRoot();
    startAt('projects');
});

afterEach(async () => {
    await testRoot.unmount();
    vi.unstubAllGlobals();
});

describe('App item workflow', () => {
    it('keeps mutations disabled until the initial query is complete', async () => {
        const listRequest = deferred<ItemPageDto>();
        const createItem = vi.fn(async () => firstItem);
        const api = createApi({
            listItems: vi.fn(() => listRequest.promise),
            createItem,
        });

        await renderApp({ api });
        const addButton = getElement<HTMLButtonElement>('.add-form .button-primary');
        expect(addButton.disabled).toBe(true);
        await click(addButton);
        expect(createItem).not.toHaveBeenCalled();

        await act(async () => {
            listRequest.resolve(itemPage());
            await listRequest.promise;
        });

        expect(addButton.disabled).toBe(false);
    });

    it('moves focus to the next row after a successful removal', async () => {
        vi.stubGlobal('confirm', vi.fn(() => true));
        const api = createApi({
            listItems: vi.fn(async () => itemPage([firstItem, secondItem])),
        });
        await renderApp({ api });

        const firstRemove = getElement<HTMLButtonElement>('.todo-item .button-danger');
        firstRemove.focus();
        await click(firstRemove);
        await flushTimers();

        expect(document.querySelectorAll('.todo-item')).toHaveLength(1);
        expect(getElement<HTMLElement>('.item-name').textContent).toBe(secondItem.name);
        await waitFor(
            () => document.activeElement === document.querySelector('.todo-item .item-move'),
        );
        expect(document.activeElement).toBe(getElement<HTMLButtonElement>('.todo-item .item-move'));
    });
});

describe('App authentication', () => {
    it('keeps a visitor without a session out by showing the form, without calling the items API', async () => {
        const listItems = vi.fn(async () => itemPage());
        const api = createApi({ listItems });
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });

        await renderApp({ api, auth });

        expect(document.querySelector('form.auth-form')).not.toBeNull();
        // The guard is on the interface side: the request is not even attempted, instead of
        // counting on the API's 401 to hide the screen.
        expect(listItems).not.toHaveBeenCalled();
    });

    it('states the password policy before anything is typed, attached to the field', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await renderApp({ auth });

        await click(getElement<HTMLButtonElement>('.button-quiet'));

        const password = getElement<HTMLInputElement>('input[type="password"]');
        const describedBy = password.getAttribute('aria-describedby');
        expect(describedBy).not.toBeNull();
        const help = getElement<HTMLElement>(`#${describedBy?.split(' ')[0] ?? ''}`);
        expect(help.textContent).toContain('12');
    });

    it('shows a single message that does not tell the address from the password', async () => {
        const auth = createAuth({
            currentAccount: vi.fn(async () => null),
            signIn: vi.fn(async () => {
                throw new ApiError(401, labels.signInRejected);
            }),
        });
        await renderApp({ auth });

        await fillSignInForm('ada@example.com', 'mauvais-mot-de-passe');

        const message = getElement<HTMLElement>('.form-error').textContent ?? '';
        expect(message).toBe(labels.signInRejected);
        expect(message.toLowerCase()).not.toContain('unknown');
        expect(message.toLowerCase()).not.toContain('inconnu');
    });

    it('reaches the user space after a successful sign-in', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await renderApp({ auth });

        await fillSignInForm('ada@example.com', 'un-mot-de-passe-valide');
        await flushTimers();

        expect(document.querySelector('form.auth-form')).toBeNull();
        expect(getElement<HTMLElement>('.session-banner').textContent).toContain(ACCOUNT.email);
    });

    it('gives each field a label and announces no error before submission', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await renderApp({ auth });

        for (const input of document.querySelectorAll<HTMLInputElement>('form.auth-form input')) {
            expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
            expect(input.getAttribute('aria-invalid')).toBe('false');
        }
        expect(document.querySelector('[role="alert"]')).toBeNull();
    });

    it('attaches the error to the field concerned and announces it', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await renderApp({ auth });

        await submitForm(getElement<HTMLFormElement>('form.auth-form'));

        const email = getElement<HTMLInputElement>('input[type="email"]');
        expect(email.getAttribute('aria-invalid')).toBe('true');
        const errorId = email.getAttribute('aria-describedby');
        const error = getElement<HTMLElement>(`#${errorId ?? ''}`);
        expect(error.getAttribute('role')).toBe('alert');
    });
});

describe('App session states', () => {
    it('waits for the server\'s answer instead of showing the form by default', async () => {
        const pending = deferred<AccountDto | null>();
        const auth = createAuth({ currentAccount: vi.fn(() => pending.promise) });

        await renderApp({ auth });

        // The session is carried by an httpOnly cookie: the page cannot read it. Showing the form
        // during the check would make it flash on every reload for someone already signed in.
        expect(document.querySelector('form.auth-form')).toBeNull();
        expect(getElement<HTMLElement>('[role="status"]').textContent).toBe('Checking your session…');

        await act(async () => {
            pending.resolve(null);
            await pending.promise;
        });

        expect(document.querySelector('form.auth-form')).not.toBeNull();
    });

    it('announces that the check failed without suggesting a sign-out', async () => {
        const currentAccount = vi.fn(async () => {
            throw new ApiError(503, 'Unable to check the session.');
        });

        await renderApp({ auth: createAuth({ currentAccount }) });

        const alerte = getElement<HTMLElement>('[role="alert"]');
        expect(alerte.querySelector('p')?.textContent).toBe('Unable to check the session.');
        expect(document.querySelector('form.auth-form')).toBeNull();

        // The screen was a bare paragraph outside any landmark, and its error branch had no way
        // out: only a reload got out of it.
        expect(getElement<HTMLElement>('main.session-check')).not.toBeNull();
        expect(getElement<HTMLElement>('h1#session-check-heading')).not.toBeNull();

        const appelsAvant = currentAccount.mock.calls.length;
        await click(getElement<HTMLButtonElement>('[role="alert"] button'));

        expect(currentAccount.mock.calls.length).toBeGreaterThan(appelsAvant);
    });

    it('confirms a registration without revealing whether the address already existed', async () => {
        const register = vi.fn(async () => undefined);
        const auth = createAuth({
            currentAccount: vi.fn(async () => null),
            register,
        });
        await renderApp({ auth });

        await click(getElement<HTMLButtonElement>('.button-quiet'));
        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'ada@example.com');
        await setInputValue(
            getElement<HTMLInputElement>('input[type="password"]'),
            'un-mot-de-passe-valide',
        );
        await click(getElement<HTMLInputElement>('input[type="checkbox"]'));
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));
        await flushTimers();

        expect(register).toHaveBeenCalledOnce();
        const message = getElement<HTMLElement>('.form-success').textContent ?? '';
        expect(message).toContain('If that address was available');
        // The password is empty: the next step is signing in.
        expect(getElement<HTMLInputElement>('input[type="password"]').value).toBe('');
    });

    it('refuses a password that is too short without calling the server', async () => {
        const register = vi.fn(async () => undefined);
        const auth = createAuth({
            currentAccount: vi.fn(async () => null),
            register,
        });
        await renderApp({ auth });

        await click(getElement<HTMLButtonElement>('.button-quiet'));
        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'ada@example.com');
        await setInputValue(getElement<HTMLInputElement>('input[type="password"]'), 'court');
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));

        expect(register).not.toHaveBeenCalled();
        expect(getElement<HTMLInputElement>('input[type="password"]').getAttribute('aria-invalid')).toBe('true');
    });

    it('lets a signed-out visitor ask for a reset link and shows a neutral reply', async () => {
        const requestPasswordReset = vi.fn(async () => undefined);
        const auth = createAuth({ currentAccount: vi.fn(async () => null), requestPasswordReset });
        await renderApp({ auth });

        await click(getElement<HTMLButtonElement>('.button-quiet:last-of-type'));
        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'ada@example.com');
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));
        await flushTimers();

        expect(requestPasswordReset).toHaveBeenCalledWith({ email: 'ada@example.com' });
        expect(getElement<HTMLElement>('.form-success').textContent).toBe(labels.resetRequestAccepted);
    });
});

describe('App password recovery', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/');
    });

    it('shows the set-new-password screen for a recovery link and clears the token from the URL', async () => {
        window.history.replaceState(null, '', '/?token_hash=abc123&type=recovery');
        const resetPassword = vi.fn(async () => undefined);
        const auth = createAuth({ resetPassword });

        await renderApp({ auth });

        expect(getElement<HTMLHeadingElement>('h1').textContent).toBe(labels.resetPasswordTitle);
        expect(window.location.search).toBe('');
        expect(document.body.innerHTML).not.toContain('abc123');
    });

    it('sends the token from the link with the new password', async () => {
        window.history.replaceState(null, '', '/?token_hash=abc123&type=recovery');
        const resetPassword = vi.fn(async () => undefined);
        const auth = createAuth({ resetPassword });
        await renderApp({ auth });

        await setInputValue(
            getElement<HTMLInputElement>('input[type="password"]'),
            'NouveauMotDePasse2',
        );
        await submitForm(getElement<HTMLFormElement>('form'));
        await flushTimers();

        expect(resetPassword).toHaveBeenCalledWith({
            token: 'abc123',
            password: 'NouveauMotDePasse2',
        });
    });
});

describe('App notifications', () => {
    it('shows the effect of the event flow once signed in', async () => {
        await renderApp({ notifications: createNotifications(3) });
        await flushTimers();

        const badge = getElement<HTMLElement>('.notification-badge');
        expect(badge.textContent).toBe('3 unread notifications');
        // Announced without interrupting: the count changes because a worker processed an event,
        // not because the user acted.
        expect(badge.getAttribute('role')).toBe('status');
    });

    it('does not ask for the notifications while there is no session', async () => {
        const notifications = createNotifications();
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });

        await renderApp({ auth, notifications, projects: createProjectsApi() });

        expect(notifications.unreadCount).not.toHaveBeenCalled();
    });
});
