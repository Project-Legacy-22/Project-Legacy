import { describe, expect, it } from 'vitest';

import { inMemoryNotificationRepository } from '../../test/fakes/in-memory-notification-repository.js';
import { aNotification } from '../../test/builders/notification.js';
import { NotificationNotFound } from '../domain/notification.js';
import { makeMarkNotificationRead } from './mark-notification-read.js';

const ACCOUNT_ID = 'account-1';
const OTHER_ACCOUNT_ID = 'account-2';

describe('markNotificationRead', () => {
    it('marque une notification non lue comme lue', async () => {
        const repository = inMemoryNotificationRepository([
            aNotification({ id: 'notif-1', userId: ACCOUNT_ID, readAt: null }),
        ]);
        const markNotificationRead = makeMarkNotificationRead(repository);

        await markNotificationRead('notif-1', ACCOUNT_ID);

        expect(repository.notifications.get('notif-1')?.readAt).not.toBeNull();
    });

    // Critere bloquant de US-18 : rejouer l action ne doit pas echouer.
    it('est idempotente sur une notification deja lue', async () => {
        const repository = inMemoryNotificationRepository([
            aNotification({ id: 'notif-1', userId: ACCOUNT_ID, readAt: '2026-09-10T11:00:00.000Z' }),
        ]);
        const markNotificationRead = makeMarkNotificationRead(repository);

        await expect(markNotificationRead('notif-1', ACCOUNT_ID)).resolves.toBeUndefined();
        expect(repository.notifications.get('notif-1')?.readAt).toBe('2026-09-10T11:00:00.000Z');
    });

    it('rejette une notification introuvable', async () => {
        const markNotificationRead = makeMarkNotificationRead(inMemoryNotificationRepository());

        await expect(markNotificationRead('missing', ACCOUNT_ID)).rejects.toBeInstanceOf(
            NotificationNotFound,
        );
    });

    it('traite la notification d un autre compte comme inexistante et la laisse intacte', async () => {
        const theirs = aNotification({ id: 'notif-1', userId: OTHER_ACCOUNT_ID, readAt: null });
        const repository = inMemoryNotificationRepository([theirs]);
        const markNotificationRead = makeMarkNotificationRead(repository);

        const result = markNotificationRead('notif-1', ACCOUNT_ID);

        await expect(result).rejects.toBeInstanceOf(NotificationNotFound);
        expect(repository.notifications.get('notif-1')?.readAt).toBeNull();
    });
});
