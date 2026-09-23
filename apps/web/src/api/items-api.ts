import { DEFAULT_ITEM_PAGE_SIZE, ItemDto, ItemPageDto } from '@legacy/contracts';
import type { CreateItemBody, ItemPriority, ItemStatus, MoveItemBody, ReorderItemBody, UpdateItemBody } from '@legacy/contracts';

import { labels } from '../labels';
import { ApiError, failureMessage, send } from './failure';

export type { ItemDto, ItemPageDto, ItemPriority, ItemStatus } from '@legacy/contracts';

export interface ListItemsRequest {
    signal: AbortSignal;
    cursor?: string;
    // Search and filter criteria (US-32). An absent field means no filter;
    // dueDate additionally accepts the literal 'none' for "no due date".
    search?: string | undefined;
    status?: ItemStatus | undefined;
    priority?: ItemPriority | undefined;
    dueDate?: string | undefined;
}

export interface ItemsApi {
    listItems: (projectId: string, request: ListItemsRequest) => Promise<ItemPageDto>;
    createItem: (projectId: string, body: CreateItemBody) => Promise<ItemDto>;
    updateItem: (projectId: string, id: string, body: UpdateItemBody) => Promise<ItemDto>;
    moveItem: (projectId: string, id: string, body: MoveItemBody) => Promise<ItemDto>;
    reorderItem: (projectId: string, id: string, body: ReorderItemBody) => Promise<ItemDto>;
    deleteItem: (projectId: string, id: string) => Promise<void>;
}

export { ApiError } from './failure';

// Exported for the other API modules: every endpoint answers a failure with the
// same problem document, so reading one is not the item client's own business.
// The fallback is a parameter because a caller usually has a better sentence
// than "the request failed" for the one operation it was attempting.
export function errorMessage(response: Response, fallback?: string): Promise<string> {
    return failureMessage(response, fallback);
}

export async function requestJson<T>(
    input: string,
    init: RequestInit,
    parse: (value: unknown) => T,
): Promise<T> {
    const response = await send(input, init);

    if (!response.ok) {
        throw new ApiError(response.status, await errorMessage(response));
    }

    try {
        return parse(await response.json());
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(502, labels.unreadableResponse);
    }
}

export const jsonHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
};

function itemsPath(projectId: string, request: Omit<ListItemsRequest, 'signal'>): string {
    const query = new URLSearchParams({ limit: String(DEFAULT_ITEM_PAGE_SIZE) });
    if (request.cursor !== undefined) query.set('cursor', request.cursor);
    if (request.search !== undefined) query.set('search', request.search);
    if (request.status !== undefined) query.set('status', request.status);
    if (request.priority !== undefined) query.set('priority', request.priority);
    if (request.dueDate !== undefined) query.set('dueDate', request.dueDate);
    return `/projects/${encodeURIComponent(projectId)}/items?${query.toString()}`;
}

export const itemsApi: ItemsApi = {
    listItems(projectId, { signal, ...request }) {
        return requestJson(
            itemsPath(projectId, request),
            { headers: { Accept: 'application/json' }, signal },
            (value) => {
                const result = ItemPageDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItemList);
                return result.data;
            },
        );
    },

    createItem(projectId, body) {
        return requestJson(
            `/projects/${encodeURIComponent(projectId)}/items`,
            { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) },
            (value) => {
                const result = ItemDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItem);
                return result.data;
            },
        );
    },

    updateItem(projectId, id, body) {
        return requestJson(
            `/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(id)}`,
            { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(body) },
            (value) => {
                const result = ItemDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItem);
                return result.data;
            },
        );
    },

    moveItem(projectId, id, body) {
        return requestJson(
            `/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(id)}/status`,
            { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body) },
            (value) => {
                const result = ItemDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItem);
                return result.data;
            },
        );
    },

    reorderItem(projectId, id, body) {
        return requestJson(
            `/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(id)}/position`,
            { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body) },
            (value) => {
                const result = ItemDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItem);
                return result.data;
            },
        );
    },

    async deleteItem(projectId, id) {
        const response = await send(`/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new ApiError(response.status, await errorMessage(response));
        }
    },
};
