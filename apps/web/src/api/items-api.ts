import {
    DEFAULT_ITEM_PAGE_SIZE,
    ItemDto,
    ItemPageDto,
    ProblemDetails,
} from '@legacy/contracts';
import type { CreateItemBody, UpdateItemBody } from '@legacy/contracts';

import { labels } from '../labels';

export type { ItemDto, ItemPageDto } from '@legacy/contracts';

export interface ListItemsRequest {
    signal: AbortSignal;
    cursor?: string;
}

export interface ItemsApi {
    listItems: (request: ListItemsRequest) => Promise<ItemPageDto>;
    createItem: (body: CreateItemBody) => Promise<ItemDto>;
    updateItem: (id: string, body: UpdateItemBody) => Promise<ItemDto>;
    deleteItem: (id: string) => Promise<void>;
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

async function errorMessage(response: Response): Promise<string> {
    try {
        const body: unknown = await response.json();
        const problem = ProblemDetails.safeParse(body);
        return problem.success ? problem.data.detail : labels.requestFailed(response.status);
    } catch {
        return labels.requestFailed(response.status);
    }
}

async function requestJson<T>(
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

const jsonHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
};

function itemsPath(cursor?: string): string {
    const query = new URLSearchParams({ limit: String(DEFAULT_ITEM_PAGE_SIZE) });
    if (cursor !== undefined) query.set('cursor', cursor);
    return `/items?${query.toString()}`;
}

export const itemsApi: ItemsApi = {
    listItems({ signal, cursor }) {
        return requestJson(
            itemsPath(cursor),
            { headers: { Accept: 'application/json' }, signal },
            value => {
                const result = ItemPageDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItemList);
                return result.data;
            },
        );
    },

    createItem(body) {
        return requestJson(
            '/items',
            { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) },
            value => {
                const result = ItemDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItem);
                return result.data;
            },
        );
    },

    updateItem(id, body) {
        return requestJson(
            `/items/${encodeURIComponent(id)}`,
            { method: 'PUT', headers: jsonHeaders, body: JSON.stringify(body) },
            value => {
                const result = ItemDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidItem);
                return result.data;
            },
        );
    },

    async deleteItem(id) {
        const response = await fetch(`/items/${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new ApiError(response.status, await errorMessage(response));
        }
    },
};
