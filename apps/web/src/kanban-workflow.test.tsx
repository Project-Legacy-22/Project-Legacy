import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api/items-api';
import type { ItemDto, ItemsApi, ItemStatus } from './api/items-api';
import { App } from './app';
import { labels } from './labels';
import { createApi, createAuth, createProjectsApi, itemPage } from './test/app-fixture';
import { anItem } from './test/builders/item-builder';
import {
    click,
    createReactTestRoot,
    flushTimers,
    getElement,
    setSelectValue,
    submitForm,
    waitFor,
} from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

const TODO = anItem({ name: 'Plan the review', status: 'todo', version: 3 });
const DOING = anItem({
    id: '00000000-0000-7000-8000-000000000021',
    name: 'Write the demo',
    status: 'doing',
    version: 2,
});
const DONE = anItem({
    id: '00000000-0000-7000-8000-000000000022',
    name: 'Create the board',
    status: 'done',
    version: 4,
});

let root: ReactTestRoot;

function column(status: ItemStatus): HTMLElement {
    return getElement(`[data-kanban-status="${status}"]`);
}

function moveButton(item = TODO): HTMLButtonElement {
    return getElement(`[data-move-item-id="${item.id}"]`);
}

async function render(api: ItemsApi): Promise<void> {
    await root.render(
        <App api={api} auth={createAuth()} projects={createProjectsApi()} />,
    );
    await flushTimers();
}

async function chooseDestination(status: ItemStatus): Promise<void> {
    await click(moveButton());
    const select = getElement<HTMLSelectElement>('.move-item-form select');
    expect(document.activeElement).toBe(select);
    await setSelectValue(select, status);
}

function hasAnnouncement(message: string): boolean {
    return [...document.querySelectorAll<HTMLElement>('[aria-live]')].some(
        (element) => element.textContent === message,
    );
}

async function dispatchDrag(element: HTMLElement, type: string, transfer: DataTransfer): Promise<void> {
    await act(async () => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'dataTransfer', { value: transfer });
        element.dispatchEvent(event);
        await Promise.resolve();
    });
}

beforeEach(() => {
    root = createReactTestRoot();
});

afterEach(async () => {
    await root.unmount();
    vi.clearAllMocks();
});

describe('Kanban workflow', () => {
    it('renders the three fixed columns and groups tasks by status', async () => {
        await render(createApi({ listItems: vi.fn(async () => itemPage([TODO, DOING, DONE])) }));

        expect(document.querySelectorAll('.kanban-column')).toHaveLength(3);
        expect(column('todo').textContent).toContain(TODO.name);
        expect(column('doing').textContent).toContain(DOING.name);
        expect(column('done').textContent).toContain(DONE.name);
    });

    it('supports choosing, cancelling and confirming a move from the keyboard controls', async () => {
        const moved = { ...TODO, status: 'doing' as const, version: 4 };
        const moveItem = vi.fn<ItemsApi['moveItem']>(async () => moved);
        await render(createApi({
            listItems: vi.fn(async () => itemPage([TODO])),
            moveItem,
        }));

        await chooseDestination('doing');
        await click(getElement<HTMLButtonElement>('.move-item-actions .button-secondary'));
        await flushTimers();
        expect(moveItem).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(moveButton());

        await chooseDestination('doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        await flushTimers();

        expect(moveItem).toHaveBeenCalledWith(TODO.projectId, TODO.id, {
            status: 'doing',
            version: 3,
        });
        expect(column('doing').textContent).toContain(TODO.name);
        expect(hasAnnouncement(labels.itemMoved(TODO.name ?? '', 'In progress'))).toBe(true);
        await waitFor(() => document.activeElement === moveButton(moved));
        expect(document.activeElement).toBe(moveButton(moved));
    });

    it('rolls back a rejected move and lets the same action be retried', async () => {
        let rejectMove: (error: ApiError) => void = () => undefined;
        const rejected = new Promise<ItemDto>((_resolve, reject) => {
            rejectMove = reject;
        });
        const moved = { ...TODO, status: 'doing' as const, version: 4 };
        const moveItem = vi.fn<ItemsApi['moveItem']>()
            .mockImplementationOnce(() => rejected)
            .mockResolvedValueOnce(moved);
        await render(createApi({
            listItems: vi.fn(async () => itemPage([TODO])),
            moveItem,
        }));

        await chooseDestination('doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        expect(column('doing').textContent).toContain(TODO.name);

        await act(async () => rejectMove(new ApiError(503, 'Unavailable')));
        await flushTimers();
        expect(column('todo').textContent).toContain(TODO.name);
        expect(getElement<HTMLElement>('.action-error').textContent).toBe(
            labels.itemMoveFailed(TODO.name ?? '', 'Todo'),
        );

        await chooseDestination('doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        await flushTimers();
        expect(moveItem).toHaveBeenCalledTimes(2);
        expect(column('doing').textContent).toContain(TODO.name);
    });

    it('reloads the server state after a concurrent move conflict', async () => {
        const current = { ...TODO, status: 'done' as const, version: 4 };
        const listItems = vi.fn<ItemsApi['listItems']>()
            .mockResolvedValueOnce(itemPage([TODO]))
            .mockResolvedValueOnce(itemPage([current]));
        const moveItem = vi.fn<ItemsApi['moveItem']>(async () => {
            throw new ApiError(409, 'Conflict');
        });
        await render(createApi({ listItems, moveItem }));

        await chooseDestination('doing');
        await submitForm(getElement<HTMLFormElement>('.move-item-form'));
        await waitFor(() => listItems.mock.calls.length === 2);
        await flushTimers();

        expect(column('done').textContent).toContain(TODO.name);
        expect(getElement<HTMLElement>('.action-error').textContent).toBe(labels.itemMoveConflict);
        expect(moveButton(current).disabled).toBe(false);
    });

    it('moves a task by drag and drop', async () => {
        const moved = { ...TODO, status: 'done' as const, version: 4 };
        const moveItem = vi.fn<ItemsApi['moveItem']>(async () => moved);
        await render(createApi({
            listItems: vi.fn(async () => itemPage([TODO])),
            moveItem,
        }));
        const transfer = {
            effectAllowed: 'none',
            setData: vi.fn(),
        } as unknown as DataTransfer;

        await dispatchDrag(getElement('.todo-item'), 'dragstart', transfer);
        await dispatchDrag(column('done'), 'dragenter', transfer);
        expect(column('done').classList.contains('kanban-column-drop-target')).toBe(true);
        await dispatchDrag(column('done'), 'drop', transfer);
        await flushTimers();

        expect(moveItem).toHaveBeenCalledWith(TODO.projectId, TODO.id, {
            status: 'done',
            version: 3,
        });
        expect(column('done').textContent).toContain(TODO.name);
    });
});
