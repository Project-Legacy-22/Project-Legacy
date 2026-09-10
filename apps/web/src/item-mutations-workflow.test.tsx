import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountApi } from './api/account-api';
import type { AuthApi } from './api/auth-api';
import type { ItemDto, ItemsApi } from './api/items-api';
import type { ProjectsApi } from './api/projects-api';
import { App } from './app';
import { labels } from './labels';
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

const ACCOUNT = {
    id: '5b1f0f4a-9d3f-4d0e-9e2a-6c0f5a3b1d77',
    email: 'ada@example.com',
};
const PROJECT = {
    id: '00000000-0000-7000-8000-000000000010',
    name: 'My project',
    role: 'owner' as const,
    itemCount: 1,
};
const ITEM: ItemDto = {
    id: '8f80ec8b-8cbf-4d0f-92b5-6297404875f1',
    projectId: PROJECT.id,
    name: 'Original task',
    status: 'todo',
    version: 1,
    completed: false,
};

const auth: AuthApi = {
    register: vi.fn(),
    signIn: vi.fn(),
    currentAccount: vi.fn(async () => ACCOUNT),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    // Required by AuthApi since #174; this suite exercises item mutations.
    signOut: vi.fn(async () => undefined),
};
const account: AccountApi = {
    exportPersonalData: vi.fn(),
    deleteAccount: vi.fn(),
};
const projects: ProjectsApi = {
    listProjects: vi.fn(async () => ({ projects: [PROJECT], nextCursor: null })),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
};

let root: ReactTestRoot;

function itemsApi(overrides: Partial<ItemsApi> = {}): ItemsApi {
    return {
        listItems: vi.fn(async () => ({ items: [ITEM], nextCursor: null })),
        createItem: vi.fn(),
        updateItem: vi.fn(),
        moveItem: vi.fn(),
        deleteItem: vi.fn(),
        ...overrides,
    };
}

function buttonWithLabel(label: string): HTMLButtonElement {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.getAttribute('aria-label') === label,
    );
    if (button === undefined) throw new Error(`Button not found: ${label}`);
    return button;
}

function hasAnnouncement(message: string): boolean {
    return [...document.querySelectorAll<HTMLElement>('[aria-live]')].some(
        (element) => element.textContent === message,
    );
}

async function render(api: ItemsApi): Promise<void> {
    await root.render(<App api={api} auth={auth} account={account} projects={projects} />);
    await flushTimers();
}

beforeEach(() => {
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('item mutation workflow', () => {
    it('edits an item from a labelled keyboard form and restores focus', async () => {
        const updateItem = vi.fn<ItemsApi['updateItem']>(async (_projectId, _id, body) => ({ ...ITEM, ...body }));
        await render(itemsApi({ updateItem }));

        await click(buttonWithLabel(labels.editItem('Original task')));
        const input = getElement<HTMLInputElement>('.item-edit-form input');
        expect(document.activeElement).toBe(input);
        await setInputValue(input, 'Renamed task');
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));
        await flushTimers();

        expect(updateItem).toHaveBeenCalledWith(PROJECT.id, ITEM.id, {
            name: 'Renamed task',
            completed: false,
        });
        expect(document.body.textContent).toContain('Renamed task');
        expect(hasAnnouncement(labels.itemRenamed('Renamed task'))).toBe(true);
        await waitFor(() => document.activeElement === buttonWithLabel(labels.editItem('Renamed task')));
        expect(document.activeElement).toBe(buttonWithLabel(labels.editItem('Renamed task')));
    });

    it('attaches an invalid edited name to its field without calling the API', async () => {
        const updateItem = vi.fn<ItemsApi['updateItem']>();
        await render(itemsApi({ updateItem }));

        await click(buttonWithLabel(labels.editItem('Original task')));
        const input = getElement<HTMLInputElement>('.item-edit-form input');
        await setInputValue(input, '   ');
        await submitForm(getElement<HTMLFormElement>('.item-edit-form'));

        const references = input.getAttribute('aria-describedby')?.split(/\s+/u) ?? [];
        expect(updateItem).not.toHaveBeenCalled();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(references.map((id) => document.getElementById(id)?.id)).toEqual(references);
        expect(getElement<HTMLElement>('[role="alert"]').textContent).toBe(labels.itemNameRequired);
    });

    it('can complete and reopen the same item from visible buttons', async () => {
        const updateItem = vi.fn<ItemsApi['updateItem']>(async (_projectId, _id, body) => ({ ...ITEM, ...body }));
        await render(itemsApi({ updateItem }));

        await click(buttonWithLabel(labels.completeItem('Original task')));
        await flushTimers();
        await click(buttonWithLabel(labels.reopenItem('Original task')));
        await flushTimers();

        expect(updateItem).toHaveBeenNthCalledWith(1, PROJECT.id, ITEM.id, {
            name: 'Original task',
            completed: true,
        });
        expect(updateItem).toHaveBeenNthCalledWith(2, PROJECT.id, ITEM.id, {
            name: 'Original task',
            completed: false,
        });
        expect(hasAnnouncement(labels.itemCompletionChanged('Original task', false))).toBe(true);
    });

    it('names the item before permanent deletion and announces the result', async () => {
        const deleteItem = vi.fn<ItemsApi['deleteItem']>(async () => undefined);
        const confirm = vi.fn(() => false);
        vi.stubGlobal('confirm', confirm);
        await render(itemsApi({ deleteItem }));

        const remove = buttonWithLabel(labels.removeItem('Original task'));
        await click(remove);
        expect(confirm).toHaveBeenCalledWith(labels.confirmItemRemoval('Original task'));
        expect(deleteItem).not.toHaveBeenCalled();

        confirm.mockReturnValue(true);
        await click(remove);
        await flushTimers();

        expect(deleteItem).toHaveBeenCalledWith(PROJECT.id, ITEM.id);
        expect(document.querySelector('.todo-item')).toBeNull();
        expect(hasAnnouncement(labels.itemRemoved('Original task'))).toBe(true);
        await waitFor(() => document.activeElement === document.querySelector('#item-name'));
        expect(document.activeElement).toBe(getElement<HTMLInputElement>('#item-name'));
    });
});
