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
    it('renvoie le compte annonce par le serveur', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ unread: 3 })));

        await expect(notificationsApi.unreadCount(new AbortController().signal)).resolves.toBe(3);
    });

    it('signale une reponse qui ne respecte pas le contrat', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ unread: 'beaucoup' })));

        await expect(
            notificationsApi.unreadCount(new AbortController().signal),
        ).rejects.toMatchObject({ status: 502 });
    });

    it('leve quand le serveur refuse', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));

        await expect(notificationsApi.unreadCount(new AbortController().signal)).rejects.toEqual(
            new ApiError(401, labels.notificationsFailed),
        );
    });

    it('interroge la route dediee, distincte de la liste', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => response({ unread: 0 }));
        vi.stubGlobal('fetch', fetchMock);

        await notificationsApi.unreadCount(new AbortController().signal);

        expect(fetchMock).toHaveBeenCalledWith('/notifications/unread-count', expect.anything());
    });
});

describe('notificationsApi.listNotifications', () => {
    it('renvoie la page et transmet le curseur a la requete suivante', async () => {
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

    it('rejette une page qui ne respecte pas le contrat', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ notifications: 'pas une liste' })));

        await expect(
            notificationsApi.listNotifications({ signal: new AbortController().signal }),
        ).rejects.toMatchObject({ status: 502 });
    });
});

describe('notificationsApi.markAsRead', () => {
    it('n attend aucun corps en reponse', async () => {
        const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(notificationsApi.markAsRead('un-id')).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith('/notifications/un-id/read', expect.objectContaining({ method: 'PATCH' }));
    });

    it('leve quand le serveur refuse', async () => {
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
