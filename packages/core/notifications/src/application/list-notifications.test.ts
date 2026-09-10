import { describe, expect, it } from 'vitest';

import { inMemoryNotificationRepository } from '../../test/fakes/in-memory-notification-repository.js';
import { aNotification } from '../../test/builders/notification.js';
import { makeListNotifications } from './list-notifications.js';

const ACCOUNT_ID = 'account-1';
const OTHER_ACCOUNT_ID = 'account-2';
const FIRST_PAGE = { limit: 10, cursor: undefined };

function threeNotificationsOf(userId: string) {
    return [
        aNotification({ id: 'notif-1', userId }),
        aNotification({ id: 'notif-2', userId }),
        aNotification({ id: 'notif-3', userId }),
    ];
}

describe('listNotifications', () => {
    it('ne renvoie que les notifications du compte demande', async () => {
        const mine = aNotification({ id: 'notif-1', userId: ACCOUNT_ID });
        const theirs = aNotification({ id: 'notif-2', userId: OTHER_ACCOUNT_ID });
        const listNotifications = makeListNotifications(
            inMemoryNotificationRepository([mine, theirs]),
        );

        const page = await listNotifications(ACCOUNT_ID, FIRST_PAGE);

        expect(page.notifications).toEqual([mine]);
    });

    it('distingue les notifications lues des non lues', async () => {
        const unread = aNotification({ id: 'notif-1', userId: ACCOUNT_ID, readAt: null });
        const read = aNotification({
            id: 'notif-2',
            userId: ACCOUNT_ID,
            readAt: '2026-09-10T11:00:00.000Z',
        });
        const listNotifications = makeListNotifications(
            inMemoryNotificationRepository([unread, read]),
        );

        const page = await listNotifications(ACCOUNT_ID, FIRST_PAGE);

        expect(page.notifications.map(n => ({ id: n.id, readAt: n.readAt }))).toEqual([
            { id: 'notif-2', readAt: read.readAt },
            { id: 'notif-1', readAt: null },
        ]);
    });

    it('sert la liste page par page sans repeter ni sauter une notification', async () => {
        const listNotifications = makeListNotifications(
            inMemoryNotificationRepository(threeNotificationsOf(ACCOUNT_ID)),
        );

        const first = await listNotifications(ACCOUNT_ID, { limit: 2, cursor: undefined });
        const second = await listNotifications(ACCOUNT_ID, { limit: 2, cursor: first.nextCursor });

        expect(first.notifications.map(n => n.id)).toEqual(['notif-3', 'notif-2']);
        expect(second.notifications.map(n => n.id)).toEqual(['notif-1']);
        expect(second.nextCursor).toBeUndefined();
    });
});
