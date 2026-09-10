import { DEFAULT_ITEM_PAGE_SIZE, ItemDto, ItemPageDto, ProblemDetails } from '@legacy/contracts';
import type { CreateItemBody, MoveItemBody, UpdateItemBody } from '@legacy/contracts';

import { labels } from '../labels';

export type { ItemDto, ItemPageDto } from '@legacy/contracts';

export interface ListItemsRequest {
    signal: AbortSignal;
    cursor?: string;
}

export interface ItemsApi {
    listItems: (projectId: string, request: ListItemsRequest) => Promise<ItemPageDto>;
    createItem: (projectId: string, body: CreateItemBody) => Promise<ItemDto>;
    updateItem: (projectId: string, id: string, body: UpdateItemBody) => Promise<ItemDto>;
    moveItem: (projectId: string, id: string, body: MoveItemBody) => Promise<ItemDto>;
    deleteItem: (projectId: string, id: string) => Promise<void>;
}

export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// Exported for the other API modules: every endpoint answers a failure with the
// same problem document, so reading one is not the item client's own business.
// The fallback is a parameter because a caller usually has a better sentence
// than "the request failed" for the one operation it was attempting.
export async function errorMessage(response: Response, fallback?: string): Promise<string> {
    const generic = fallback ?? labels.requestFailed(response.status);
    try {
        const body: unknown = await response.json();
        const problem = ProblemDetails.safeParse(body);
        return problem.success ? problem.data.detail : generic;
    } catch {
        return generic;
    }
}

export async function requestJson<T>(
    input: string,
    init: RequestInit,
    parse: (value: unknown) => T,
): Promise<T> {
    const response = await fetch(input, init);

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

function itemsPath(projectId: string, cursor?: string): string {
    const query = new URLSearchParams({ limit: String(DEFAULT_ITEM_PAGE_SIZE) });
    if (cursor !== undefined) query.set('cursor', cursor);
    return `/projects/${encodeURIComponent(projectId)}/items?${query.toString()}`;
}

export const itemsApi: ItemsApi = {
    listItems(projectId, { signal, cursor }) {
        return requestJson(
            itemsPath(projectId, cursor),
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

    async deleteItem(projectId, id) {
        const response = await fetch(`/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new ApiError(response.status, await errorMessage(response));
        }
    },
};
