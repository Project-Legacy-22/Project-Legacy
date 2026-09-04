import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemDto, ItemPageDto, ItemsApi } from './api/items-api';
import { ApiError } from './api/items-api';
import type { AccountDto, AuthApi } from './api/auth-api';
import {
    click,
    createReactTestRoot,
    flushTimers,
    getElement,
    setInputValue,
    submitForm,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';
import { anItem } from './test/builders/item-builder';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

const firstItem = anItem({
    id: '1c99b4ae-b7b8-49e7-885e-b2d976c1fe19',
    name: 'First item',
});

const secondItem = anItem({
    id: '93a3eb56-61a2-4b0b-8e92-bb97fb9b3531',
    name: 'Second item',
});

let testRoot: ReactTestRoot;

function deferred<T>(): Deferred<T> {
    let resolve: Deferred<T>['resolve'] = () => {
        throw new Error('Deferred promise was not initialized.');
    };
    const promise = new Promise<T>(promiseResolve => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

function createApi(overrides: Partial<ItemsApi> = {}): ItemsApi {
    return {
        listItems: vi.fn(async () => itemPage()),
        createItem: vi.fn(async () => firstItem),
        updateItem: vi.fn(async () => firstItem),
        deleteItem: vi.fn(async () => undefined),
        ...overrides,
    };
}

function itemPage(items: readonly ItemDto[] = [], nextCursor: string | null = null): ItemPageDto {
    return { items: [...items], nextCursor };
}

const ACCOUNT: AccountDto = { id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77', email: 'ada@example.com' };

// Signed in by default: the item tests below are about the item workflow, and
// making each of them sign in first would test the session over and over.
function createAuth(overrides: Partial<AuthApi> = {}): AuthApi {
    return {
        register: vi.fn(async () => undefined),
        signIn: vi.fn(async () => ACCOUNT),
        currentAccount: vi.fn(async () => ACCOUNT),
        ...overrides,
    };
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
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('App item workflow', () => {
    it('keeps mutations disabled until the initial query is complete', async () => {
        const listRequest = deferred<ItemPageDto>();
        const createItem = vi.fn(async () => firstItem);
        const api = createApi({ listItems: vi.fn(() => listRequest.promise), createItem });

        await testRoot.render(<App api={api} auth={createAuth()} />);
        const addButton = getElement<HTMLButtonElement>('.button-primary');
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
        const api = createApi({
            listItems: vi.fn(async () => itemPage([firstItem, secondItem])),
        });
        await testRoot.render(<App api={api} auth={createAuth()} />);

        const firstRemove = getElement<HTMLButtonElement>('.button-danger');
        firstRemove.focus();
        await click(firstRemove);
        await flushTimers();

        expect(document.querySelectorAll('.todo-item')).toHaveLength(1);
        expect(getElement<HTMLElement>('.item-name').textContent).toBe(secondItem.name);
        expect(document.activeElement).toBe(getElement<HTMLButtonElement>('.button-secondary'));
    });
});

describe('App authentication', () => {
    it('ecarte le visiteur sans session en montrant le formulaire, sans appeler l API des items', async () => {
        const listItems = vi.fn(async () => itemPage());
        const api = createApi({ listItems });
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });

        await testRoot.render(<App api={api} auth={auth} />);

        expect(document.querySelector('form.auth-form')).not.toBeNull();
        // Le garde est cote interface : la requete n est meme pas tentee, au
        // lieu de compter sur le 401 de l API pour cacher l ecran.
        expect(listItems).not.toHaveBeenCalled();
    });

    it('enonce la politique de mot de passe avant toute saisie, rattachee au champ', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await click(getElement<HTMLButtonElement>('.button-quiet'));

        const password = getElement<HTMLInputElement>('input[type="password"]');
        const describedBy = password.getAttribute('aria-describedby');
        expect(describedBy).not.toBeNull();
        const help = getElement<HTMLElement>(`#${describedBy?.split(' ')[0] ?? ''}`);
        expect(help.textContent).toContain('12');
    });

    it('affiche un message unique qui ne distingue pas l adresse du mot de passe', async () => {
        const auth = createAuth({
            currentAccount: vi.fn(async () => null),
            signIn: vi.fn(async () => {
                throw new ApiError(401, 'Email address or password is incorrect.');
            }),
        });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await fillSignInForm('ada@example.com', 'mauvais-mot-de-passe');

        const message = getElement<HTMLElement>('.form-error').textContent ?? '';
        expect(message).toBe('Email address or password is incorrect.');
        expect(message.toLowerCase()).not.toContain('unknown');
        expect(message.toLowerCase()).not.toContain('inconnu');
    });

    it('atteint l espace de l utilisateur apres une connexion reussie', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await fillSignInForm('ada@example.com', 'un-mot-de-passe-valide');
        await flushTimers();

        expect(document.querySelector('form.auth-form')).toBeNull();
        expect(getElement<HTMLElement>('.session-banner').textContent).toContain(ACCOUNT.email);
    });

    it('associe une etiquette a chaque champ et n annonce aucune erreur avant soumission', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        for (const input of document.querySelectorAll<HTMLInputElement>('form.auth-form input')) {
            expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
            expect(input.getAttribute('aria-invalid')).toBe('false');
        }
        expect(document.querySelector('[role="alert"]')).toBeNull();
    });

    it('rattache l erreur au champ concerne et l annonce', async () => {
        const auth = createAuth({ currentAccount: vi.fn(async () => null) });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await submitForm(getElement<HTMLFormElement>('form.auth-form'));

        const email = getElement<HTMLInputElement>('input[type="email"]');
        expect(email.getAttribute('aria-invalid')).toBe('true');
        const errorId = email.getAttribute('aria-describedby');
        const error = getElement<HTMLElement>(`#${errorId ?? ''}`);
        expect(error.getAttribute('role')).toBe('alert');
    });
});

describe('App session states', () => {
    it('attend la reponse du serveur au lieu de montrer le formulaire par defaut', async () => {
        const pending = deferred<AccountDto | null>();
        const auth = createAuth({ currentAccount: vi.fn(() => pending.promise) });

        await testRoot.render(<App api={createApi()} auth={auth} />);

        // La session est portee par un cookie httpOnly : la page ne peut pas la
        // lire. Montrer le formulaire pendant la verification le ferait
        // clignoter a chaque rechargement pour quelqu un de deja connecte.
        expect(document.querySelector('form.auth-form')).toBeNull();
        expect(getElement<HTMLElement>('[role="status"]').textContent).toBe('Checking your session…');

        await act(async () => {
            pending.resolve(null);
            await pending.promise;
        });

        expect(document.querySelector('form.auth-form')).not.toBeNull();
    });

    it('annonce l echec de la verification sans faire croire a une deconnexion', async () => {
        const auth = createAuth({
            currentAccount: vi.fn(async () => {
                throw new ApiError(503, 'Unable to check the session.');
            }),
        });

        await testRoot.render(<App api={createApi()} auth={auth} />);

        expect(getElement<HTMLElement>('[role="alert"]').textContent).toBe(
            'Unable to check the session.',
        );
        expect(document.querySelector('form.auth-form')).toBeNull();
    });

    it('confirme une inscription sans reveler si l adresse existait deja', async () => {
        const register = vi.fn(async () => undefined);
        const auth = createAuth({ currentAccount: vi.fn(async () => null), register });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await click(getElement<HTMLButtonElement>('.button-quiet'));
        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'ada@example.com');
        await setInputValue(
            getElement<HTMLInputElement>('input[type="password"]'),
            'un-mot-de-passe-valide',
        );
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));
        await flushTimers();

        expect(register).toHaveBeenCalledOnce();
        const message = getElement<HTMLElement>('.form-success').textContent ?? '';
        expect(message).toContain('If that address was available');
        // Le mot de passe est vide : l etape suivante est la connexion.
        expect(getElement<HTMLInputElement>('input[type="password"]').value).toBe('');
    });

    it('refuse un mot de passe trop court sans appeler le serveur', async () => {
        const register = vi.fn(async () => undefined);
        const auth = createAuth({ currentAccount: vi.fn(async () => null), register });
        await testRoot.render(<App api={createApi()} auth={auth} />);

        await click(getElement<HTMLButtonElement>('.button-quiet'));
        await setInputValue(getElement<HTMLInputElement>('input[type="email"]'), 'ada@example.com');
        await setInputValue(getElement<HTMLInputElement>('input[type="password"]'), 'court');
        await submitForm(getElement<HTMLFormElement>('form.auth-form'));

        expect(register).not.toHaveBeenCalled();
        expect(getElement<HTMLInputElement>('input[type="password"]').getAttribute('aria-invalid')).toBe(
            'true',
        );
    });
});
