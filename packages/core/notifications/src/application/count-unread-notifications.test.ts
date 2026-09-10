import { describe, expect, it } from 'vitest';

import { inMemoryNotificationRepository } from '../../test/fakes/in-memory-notification-repository.js';
import { aNotification } from '../../test/builders/notification.js';
import { makeCountUnreadNotifications } from './count-unread-notifications.js';

const ACCOUNT_ID = 'account-1';
const OTHER_ACCOUNT_ID = 'account-2';

describe('countUnreadNotifications', () => {
    it('compte les non lues du compte demande, sans les autres', async () => {
        const repository = inMemoryNotificationRepository([
            aNotification({ id: 'notif-1', userId: ACCOUNT_ID, readAt: null }),
            aNotification({ id: 'notif-2', userId: ACCOUNT_ID, readAt: '2026-09-10T11:00:00.000Z' }),
            aNotification({ id: 'notif-3', userId: OTHER_ACCOUNT_ID, readAt: null }),
        ]);
        const countUnreadNotifications = makeCountUnreadNotifications(repository);

        await expect(countUnreadNotifications(ACCOUNT_ID)).resolves.toBe(1);
    });

    it('renvoie zero quand il n y a rien a lire', async () => {
        const countUnreadNotifications = makeCountUnreadNotifications(inMemoryNotificationRepository());

        await expect(countUnreadNotifications(ACCOUNT_ID)).resolves.toBe(0);
    });
});
