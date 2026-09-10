import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, itemsApi } from './items-api';

const PROJECT_ID = '00000000-0000-7000-8000-000000000010';
const ITEM_ID = '00000000-0000-7000-8000-000000000020';
const ITEM = {
    id: ITEM_ID,
    projectId: PROJECT_ID,
    name: 'Prepare the review',
    completed: false,
};

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('itemsApi', () => {
    it('rejects an invalid item returned by the server', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => response([{ id: 42 }])),
        );

        await expect(itemsApi.listItems(PROJECT_ID, { signal: new AbortController().signal })).rejects.toMatchObject({
            name: 'ApiError',
            status: 502,
        });
    });

    it('returns the next cursor and sends it back for the following page', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () =>
            response({
                items: [],
                nextCursor: 'created at/id',
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const signal = new AbortController().signal;

        await expect(
            itemsApi.listItems(PROJECT_ID, {
                signal,
                cursor: 'previous cursor/id',
            }),
        ).resolves.toEqual({ items: [], nextCursor: 'created at/id' });
        expect(fetchMock).toHaveBeenCalledWith(
            `/projects/${PROJECT_ID}/items?limit=20&cursor=previous+cursor%2Fid`,
            expect.objectContaining({ signal }),
        );
    });

    it('turns a non-success response into a typed error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                response(
                    {
                        type: 'validation_error',
                        title: 'ValidationError',
                        status: 400,
                        detail: 'Item name must not be empty.',
                        instance: '/items',
                        traceId: 'a-test-trace-id',
                    },
                    400,
                ),
            ),
        );

        await expect(itemsApi.createItem(PROJECT_ID, { name: '' })).rejects.toEqual(
            new ApiError(400, 'Item name must not be empty.'),
        );
    });

    it('updates the editable item state in its project', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => response({ ...ITEM, completed: true }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            itemsApi.updateItem(PROJECT_ID, ITEM_ID, {
                name: ITEM.name,
                completed: true,
            }),
        ).resolves.toEqual({ ...ITEM, completed: true });
        expect(fetchMock).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/items/${ITEM_ID}`, {
            method: 'PUT',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: ITEM.name, completed: true }),
        });
    });

    it('accepts an empty successful response when permanently deleting an item', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(itemsApi.deleteItem(PROJECT_ID, ITEM_ID)).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/items/${ITEM_ID}`, {
            method: 'DELETE',
            headers: { Accept: 'application/json' },
        });
    });
});
