import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccountDto, AuthApi } from './api/auth-api';
import { ApiError } from './api/items-api';
import type { ItemPageDto, ItemsApi, ListItemsRequest } from './api/items-api';
import type { ProjectsApi } from './api/projects-api';
import { App } from './app';
import { labels } from './labels';
import { anItem } from './test/builders/item-builder';
import { click, createReactTestRoot, flushTimers, getElement, waitFor } from './test/react-root';
import type { ReactTestRoot } from './test/react-root';

const ACCOUNT = {
    id: 'account',
    email: 'ada@example.com',
} satisfies AccountDto;
const firstItem = anItem({ id: 'first', name: 'First item' });
const secondItem = anItem({ id: 'second', name: 'Second item' });
const PROJECT_ID = firstItem.projectId;

let testRoot: ReactTestRoot;

function createApi(listItems: ItemsApi['listItems']): ItemsApi {
    return {
        listItems,
        createItem: vi.fn(async () => firstItem),
        updateItem: vi.fn(async () => firstItem),
        deleteItem: vi.fn(async () => undefined),
    };
}

const auth: AuthApi = {
    register: vi.fn(async () => undefined),
    signIn: vi.fn(async () => ACCOUNT),
    currentAccount: vi.fn(async () => ACCOUNT),
    requestPasswordReset: vi.fn(async () => undefined),
    resetPassword: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
};

const projects: ProjectsApi = {
    listProjects: vi.fn(async () => ({
        projects: [
            {
                id: PROJECT_ID,
                name: 'My project',
                role: 'owner' as const,
                itemCount: 2,
            },
        ],
        nextCursor: null,
    })),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
};

beforeEach(() => {
    testRoot = createReactTestRoot();
});

afterEach(async () => {
    await testRoot.unmount();
});

describe('App item pagination', () => {
    it('keeps the current page visible while loading and retries a failed page', async () => {
        let rejectNextPage: (reason: ApiError) => void = () => undefined;
        const failedNextPage = new Promise<ItemPageDto>((_resolve, reject) => {
            rejectNextPage = reject;
        });
        let nextPageAttempts = 0;
        const listItems = vi.fn(async (_projectId: string, request: ListItemsRequest): Promise<ItemPageDto> => {
            if (request.cursor === undefined) {
                return { items: [firstItem], nextCursor: 'next page' };
            }
            nextPageAttempts += 1;
            if (nextPageAttempts === 1) return failedNextPage;
            return { items: [secondItem], nextCursor: null };
        });
        await testRoot.render(<App api={createApi(listItems)} auth={auth} projects={projects} />);

        const loadMore = getElement<HTMLButtonElement>('.items-pagination button');
        loadMore.focus();
        await click(loadMore);

        expect(loadMore.getAttribute('aria-disabled')).toBe('true');
        expect(listItems.mock.calls[1]?.[1].cursor).toBe('next page');

        await act(async () => {
            rejectNextPage(new ApiError(503, labels.loadMoreItemsFailed));
            await failedNextPage.catch(() => undefined);
        });

        expect(document.querySelectorAll('.todo-item')).toHaveLength(1);
        expect(getElement<HTMLElement>('.pagination-error').getAttribute('role')).toBe('alert');

        await click(getElement<HTMLButtonElement>('.items-pagination button'));
        await flushTimers();

        expect(document.querySelectorAll('.todo-item')).toHaveLength(2);
        expect(document.querySelector('.pagination-error')).toBeNull();
        expect(listItems).toHaveBeenCalledTimes(3);
        expect(loadMore.getAttribute('aria-disabled')).toBe('true');
        expect(loadMore.textContent).toBe(labels.allItemsLoaded);
        await waitFor(() => document.activeElement === loadMore);
        expect(document.activeElement).toBe(loadMore);
        expect(getElement<HTMLElement>('.pagination-status').textContent).toBe(labels.itemsLoaded(1));
    });
});
