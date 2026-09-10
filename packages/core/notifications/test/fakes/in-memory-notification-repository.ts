import { InvalidNotificationCursor } from '../../src/index.js';
import type { Notification, NotificationRepository } from '../../src/index.js';

// A real, in-process implementation of the port, not a mock: it behaves like
// a repository, so a test using it exercises the same contract the Supabase
// adapter honors, and it keeps working across a refactor of the code under
// test.
export interface InMemoryNotificationRepository extends NotificationRepository {
    notifications: Map<string, Notification>;
}

export function inMemoryNotificationRepository(
    seed: Notification[] = [],
): InMemoryNotificationRepository {
    const notifications = new Map(seed.map(notification => [notification.id, notification]));

    // Most recent first, like the adapter, insertion order standing in for
    // creation order: a fake that ordered otherwise would prove nothing.
    function ownedBy(accountId: string): Notification[] {
        return [...notifications.values()].filter(n => n.userId === accountId).reverse();
    }

    return {
        notifications,
        findPageForAccount: (accountId, { limit, cursor }) => {
            const owned = ownedBy(accountId);
            const from = cursor === undefined ? 0 : owned.findIndex(n => n.id === cursor) + 1;

            // Refused rather than silently answered with the first page,
            // exactly as the adapter refuses a cursor it did not mint.
            if (cursor !== undefined && from === 0) {
                return Promise.reject(new InvalidNotificationCursor());
            }

            const page = owned.slice(from, from + limit);
            const last = page.at(-1);

            return Promise.resolve({
                notifications: page,
                nextCursor: from + limit < owned.length && last !== undefined ? last.id : undefined,
            });
        },
        markAsRead: (id, accountId) => {
            const notification = notifications.get(id);
            if (notification === undefined || notification.userId !== accountId) {
                return Promise.resolve(false);
            }

            if (notification.readAt === null) {
                notifications.set(id, { ...notification, readAt: new Date().toISOString() });
            }
            return Promise.resolve(true);
        },
        countUnread: accountId => {
            return Promise.resolve(ownedBy(accountId).filter(n => n.readAt === null).length);
        },
    };
}
