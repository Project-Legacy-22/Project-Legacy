import { afterEach, describe, expect, it, vi } from 'vitest';

import { notificationsApi } from './notifications-api';
import { ApiError } from './items-api';
import { labels } from '../labels';

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('notificationsApi.unreadCount', () => {
    it('returns the count the server announces', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ unread: 3 })));

        await expect(notificationsApi.unreadCount(new AbortController().signal)).resolves.toBe(3);
    });

    it('reports a response that does not respect the contract', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ unread: 'beaucoup' })));

        await expect(
            notificationsApi.unreadCount(new AbortController().signal),
        ).rejects.toMatchObject({ status: 502 });
    });

    it('throws when the server refuses', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));

        await expect(notificationsApi.unreadCount(new AbortController().signal)).rejects.toEqual(
            new ApiError(401, labels.notificationsFailed),
        );
    });

    it('calls the dedicated route, distinct from the list', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => response({ unread: 0 }));
        vi.stubGlobal('fetch', fetchMock);

        await notificationsApi.unreadCount(new AbortController().signal);

        expect(fetchMock).toHaveBeenCalledWith('/notifications/unread-count', expect.anything());
    });
});

describe('notificationsApi.listNotifications', () => {
    it('returns the page and passes the cursor to the next request', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () =>
            response({ notifications: [], nextCursor: 'created at/id' }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const signal = new AbortController().signal;

        await expect(
            notificationsApi.listNotifications({ signal, cursor: 'previous cursor/id' }),
        ).resolves.toEqual({ notifications: [], nextCursor: 'created at/id' });
        expect(fetchMock).toHaveBeenCalledWith(
            '/notifications?limit=20&cursor=previous+cursor%2Fid',
            expect.objectContaining({ signal }),
        );
    });

    it('rejects a page that does not respect the contract', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ notifications: 'pas une liste' })));

        await expect(
            notificationsApi.listNotifications({ signal: new AbortController().signal }),
        ).rejects.toMatchObject({ status: 502 });
    });
});

describe('notificationsApi.markAsRead', () => {
    it('expects no body in the response', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(notificationsApi.markAsRead('un-id')).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith('/notifications/un-id/read', expect.objectContaining({ method: 'PATCH' }));
    });

    it('throws when the server refuses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () =>
                response(
                    {
                        type: 'notification_not_found',
                        title: 'NotificationNotFound',
                        status: 404,
                        detail: 'Notification un-id not found',
                        instance: '/notifications/un-id/read',
                        traceId: 'a-test-trace-id',
                    },
                    404,
                ),
            ),
        );

        await expect(notificationsApi.markAsRead('un-id')).rejects.toEqual(
            new ApiError(404, 'Notification un-id not found'),
        );
    });
});
