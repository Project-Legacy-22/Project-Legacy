import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './app';
import type { ItemDto, ItemsApi } from './api/items-api';
import {
    click,
    createReactTestRoot,
    flushTimers,
    getElement,
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
        listItems: vi.fn(async () => []),
        createItem: vi.fn(async () => firstItem),
        updateItem: vi.fn(async () => firstItem),
        deleteItem: vi.fn(async () => undefined),
        ...overrides,
    };
}

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('App item workflow', () => {
    it('keeps mutations disabled until the initial query is complete', async () => {
        const listRequest = deferred<readonly ItemDto[]>();
        const createItem = vi.fn(async () => firstItem);
        const api = createApi({ listItems: vi.fn(() => listRequest.promise), createItem });

        await testRoot.render(<App api={api} />);
        const addButton = getElement<HTMLButtonElement>('.button-primary');
        expect(addButton.disabled).toBe(true);
        await click(addButton);
        expect(createItem).not.toHaveBeenCalled();

        await act(async () => {
            listRequest.resolve([]);
            await listRequest.promise;
        });

        expect(addButton.disabled).toBe(false);
    });

    it('moves focus to the next row after a successful removal', async () => {
        const api = createApi({ listItems: vi.fn(async () => [firstItem, secondItem]) });
        await testRoot.render(<App api={api} />);

        const firstRemove = getElement<HTMLButtonElement>('.button-danger');
        firstRemove.focus();
        await click(firstRemove);
        await flushTimers();

        expect(document.querySelectorAll('.todo-item')).toHaveLength(1);
        expect(getElement<HTMLElement>('.item-name').textContent).toBe(secondItem.name);
        expect(document.activeElement).toBe(getElement<HTMLButtonElement>('.button-secondary'));
    });
});
