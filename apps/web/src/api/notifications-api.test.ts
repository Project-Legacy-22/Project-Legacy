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
});
