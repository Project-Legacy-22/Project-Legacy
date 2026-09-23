import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ItemPageDto, ItemsApi, ListItemsRequest } from './api/items-api';
import { App } from './app';
import { labels } from './labels';
import { createAuth, createProjectsApi, firstItem, itemPage } from './test/app-fixture';
import { click, createReactTestRoot, getElement, setInputValue, setSelectValue, waitFor } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

let testRoot: ReactTestRoot;

function createApi(listItems: ItemsApi['listItems']): ItemsApi {
    return {
        listItems,
        createItem: vi.fn(async () => firstItem),
        updateItem: vi.fn(async () => firstItem),
        moveItem: vi.fn(async () => firstItem),
        deleteItem: vi.fn(async () => undefined),
    };
}

async function advance(milliseconds: number): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(milliseconds);
    });
}

async function renderApp(listItems: ItemsApi['listItems']): Promise<void> {
    await testRoot.render(<App api={createApi(listItems)} auth={createAuth()} projects={createProjectsApi()} />);
    await waitFor(() => document.querySelector('#items-search') !== null);
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
    vi.useRealTimers();
});

describe('App search and filters', () => {
    it('debounces the search field before requesting a filtered page', async () => {
        const listItems = vi.fn(async (_projectId: string, _request: ListItemsRequest): Promise<ItemPageDto> => itemPage([firstItem]));
        await renderApp(listItems);
        vi.useFakeTimers();
        const calls = listItems.mock.calls.length;

        await setInputValue(getElement<HTMLInputElement>('#items-search'), 'cafe');
        expect(listItems.mock.calls.length).toBe(calls);

        await advance(299);
        expect(listItems.mock.calls.length).toBe(calls);

        await advance(1);
        expect(listItems.mock.calls.length).toBe(calls + 1);
        const request = listItems.mock.calls.at(-1)?.[1] as ListItemsRequest;
        expect(request.search).toBe('cafe');
    });

    it('combines status, priority and due-date filters, and lets a due date and "no due date" stay mutually exclusive', async () => {
        const listItems = vi.fn(async (_projectId: string, _request: ListItemsRequest): Promise<ItemPageDto> => itemPage([firstItem]));
        await renderApp(listItems);

        await setSelectValue(getElement<HTMLSelectElement>('#items-filter-status'), 'doing');
        await setSelectValue(getElement<HTMLSelectElement>('#items-filter-priority'), 'high');
        await setInputValue(getElement<HTMLInputElement>('#items-filter-due-date'), '2026-09-20');

        let request = listItems.mock.calls.at(-1)?.[1] as ListItemsRequest;
        expect(request).toMatchObject({ status: 'doing', priority: 'high', dueDate: '2026-09-20' });

        await click(getElement<HTMLInputElement>('#items-filter-no-due-date'));
        request = listItems.mock.calls.at(-1)?.[1] as ListItemsRequest;
        expect(request.dueDate).toBe('none');
        expect(getElement<HTMLInputElement>('#items-filter-due-date').disabled).toBe(true);
    });

    it('shows Clear filters only once a criterion is active, and resets every field in one action', async () => {
        const listItems = vi.fn(async (_projectId: string, _request: ListItemsRequest): Promise<ItemPageDto> => itemPage([firstItem]));
        await renderApp(listItems);

        expect(document.querySelector('.items-filters button')).toBeNull();

        await setSelectValue(getElement<HTMLSelectElement>('#items-filter-status'), 'doing');
        const clear = getElement<HTMLButtonElement>('.items-filters button');
        expect(clear.textContent).toBe(labels.clearFilters);

        await click(clear);

        expect(document.querySelector('.items-filters button')).toBeNull();
        expect(getElement<HTMLSelectElement>('#items-filter-status').value).toBe('');
        const request = listItems.mock.calls.at(-1)?.[1] as ListItemsRequest;
        expect(request.status).toBeUndefined();
    });

    it('announces the result count after a filtered load', async () => {
        const listItems = vi.fn(async (_projectId: string, request: ListItemsRequest): Promise<ItemPageDto> =>
            request.status === 'doing' ? itemPage([]) : itemPage([firstItem]));
        await renderApp(listItems);

        await setSelectValue(getElement<HTMLSelectElement>('#items-filter-status'), 'doing');

        expect(getElement<HTMLElement>('.pagination-status').textContent).toBe(labels.itemsFound(0));
    });

    it('offers to clear filters, not to add an item, when a filter matches nothing', async () => {
        const listItems = vi.fn(async (_projectId: string, request: ListItemsRequest): Promise<ItemPageDto> =>
            request.search === undefined ? itemPage([firstItem]) : itemPage([]));
        await renderApp(listItems);
        vi.useFakeTimers();

        await setInputValue(getElement<HTMLInputElement>('#items-search'), 'introuvable');
        await advance(300);

        const action = getElement<HTMLButtonElement>('.empty-message button');
        expect(action.textContent).toBe(labels.clearFilters);
        expect(document.querySelector('.empty-message')?.textContent).toContain(labels.noSearchResults);
    });

    it('keeps the search field reachable and usable without a pointer', async () => {
        const listItems = vi.fn(async (_projectId: string, _request: ListItemsRequest): Promise<ItemPageDto> => itemPage([firstItem]));
        await renderApp(listItems);

        const search = getElement<HTMLInputElement>('#items-search');
        search.focus();
        expect(document.activeElement).toBe(search);

        vi.useFakeTimers();
        await setInputValue(search, 'pain');
        await advance(300);

        expect(search.value).toBe('pain');
        const request = listItems.mock.calls.at(-1)?.[1] as ListItemsRequest;
        expect(request.search).toBe('pain');
    });
});
