import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, itemsApi } from './items-api';

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
        vi.stubGlobal('fetch', vi.fn(async () => response([{ id: 42 }])));

        await expect(
            itemsApi.listItems({ signal: new AbortController().signal }),
        ).rejects.toMatchObject({ name: 'ApiError', status: 502 });
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
            itemsApi.listItems({
                signal,
                cursor: 'previous cursor/id',
            }),
        ).resolves.toEqual({ items: [], nextCursor: 'created at/id' });
        expect(fetchMock).toHaveBeenCalledWith(
            '/items?limit=20&cursor=previous+cursor%2Fid',
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

        await expect(itemsApi.createItem({ name: '' })).rejects.toEqual(
            new ApiError(400, 'Item name must not be empty.'),
        );
    });
});
