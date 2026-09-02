import { ItemDto, ItemListDto, ProblemDetails } from '@legacy/contracts';
import type { CreateItemBody, UpdateItemBody } from '@legacy/contracts';

import { labels } from '../labels';

export type { ItemDto } from '@legacy/contracts';

export interface ItemsApi {
    listItems(signal: AbortSignal): Promise<readonly ItemDto[]>;
    createItem(body: CreateItemBody): Promise<ItemDto>;
    updateItem(id: string, body: UpdateItemBody): Promise<ItemDto>;
    deleteItem(id: string): Promise<void>;
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

export const itemsApi: ItemsApi = {
    listItems(signal) {
        return requestJson('/items', { headers: { Accept: 'application/json' }, signal }, value => {
            const result = ItemListDto.safeParse(value);
            if (!result.success) throw new ApiError(502, labels.invalidItemList);
            return result.data;
        });
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
