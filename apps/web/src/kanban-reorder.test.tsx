import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api/items-api';
import type { ItemDto, ItemsApi } from './api/items-api';
import { App } from './app';
import { labels } from './labels';
import { createApi, createAuth, createProjectsApi, itemPage } from './test/app-fixture';
import { anItem } from './test/builders/item-builder';
import { click, createReactTestRoot, flushTimers, getElement, waitFor } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

const FIRST = anItem({ id: '00000000-0000-7000-8000-000000000011', name: 'First task' });
const SECOND = anItem({ id: '00000000-0000-7000-8000-000000000012', name: 'Second task' });
const OTHER_GROUP = anItem({
    id: '00000000-0000-7000-8000-000000000013', name: 'Other group', priority: 'low',
});

let root: ReactTestRoot;

function reorderButton(name: string, direction: string): HTMLButtonElement {
    return getElement<HTMLButtonElement>(`button[aria-label="${labels.reorderItem(name, direction)}"]`);
}

function namesInTodo(): string[] {
    return [...getElement('[data-kanban-status="todo"]').querySelectorAll('.item-name')]
        .map((element) => element.textContent ?? '');
}

async function render(api: ItemsApi): Promise<void> {
    await root.render(<App api={api} auth={createAuth()} projects={createProjectsApi()} />);
    await flushTimers();
}

beforeEach(() => { root = createReactTestRoot(); });
afterEach(async () => { await root.unmount(); vi.clearAllMocks(); });

describe('reordering within a Kanban column', () => {
    it('moves adjacent equal-priority tasks with a keyboard button and announces the result', async () => {
        const moved = { ...SECOND, position: FIRST.position, version: 2 };
        const reorderItem = vi.fn<ItemsApi['reorderItem']>(async () => moved);
        await render(createApi({
            listItems: vi.fn(async () => itemPage([FIRST, SECOND, OTHER_GROUP])), reorderItem,
        }));

        expect(reorderButton(FIRST.name ?? '', labels.reorderUp).disabled).toBe(true);
        expect(reorderButton(SECOND.name ?? '', labels.reorderDown).disabled).toBe(true);
        const button = reorderButton(SECOND.name ?? '', labels.reorderUp);
        button.focus();
        await click(button);
        await flushTimers();

        expect(reorderItem).toHaveBeenCalledWith(SECOND.projectId, SECOND.id, {
            position: FIRST.position, version: 1,
        });
        expect(namesInTodo()).toEqual(['Second task', 'First task', 'Other group']);
        expect(document.activeElement).toBe(button);
        expect([...document.querySelectorAll('[aria-live="polite"]')].some(
            (region) => region.textContent === labels.itemReordered('Second task', 'up'),
        )).toBe(true);
    });

    it('reloads the server order after a conflicting move', async () => {
        const latest: ItemDto[] = [FIRST, { ...SECOND, status: 'doing', version: 2 }];
        const listItems = vi.fn<ItemsApi['listItems']>()
            .mockResolvedValueOnce(itemPage([FIRST, SECOND]))
            .mockResolvedValueOnce(itemPage(latest));
        const reorderItem = vi.fn<ItemsApi['reorderItem']>(async () => {
            throw new ApiError(409, 'Conflict');
        });
        await render(createApi({ listItems, reorderItem }));

        await click(reorderButton('Second task', labels.reorderUp));
        await waitFor(() => listItems.mock.calls.length === 2);
        await flushTimers();

        expect(getElement('[data-kanban-status="doing"]').textContent).toContain('Second task');
        expect(getElement('.action-error').textContent).toBe(labels.itemReorderConflict);
    });
});
