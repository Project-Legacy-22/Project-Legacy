import type { Notification } from '../domain/notification.js';

// Where a page stops, and where the next one resumes. The cursor is minted
// and read by the adapter alone; the use cases carry it through untouched.
export interface NotificationPageQuery {
    limit: number;
    cursor: string | undefined;
}

export interface NotificationPage {
    notifications: Notification[];
    nextCursor: string | undefined;
}

// What the use cases require of the outside world, named after the need and
// not after the technology. packages/infra provides the implementation.
//
// Every read names an account (US-18, like US-12 for items). There is
// deliberately no way to ask this port for a notification without saying on
// whose behalf: one forgotten argument at a call site would otherwise hand a
// caller someone else's notifications.
export interface NotificationRepository {
    findPageForAccount(accountId: string, page: NotificationPageQuery): Promise<NotificationPage>;

    // Returns false when the notification does not exist, or exists for
    // someone else: the use case turns that into NotificationNotFound.
    // Returns true otherwise, whether this call is the one setting readAt or
    // the notification was read before: marking as read is idempotent, and
    // the adapter is the one place that can tell those two apart without a
    // race between the check and the write.
    markAsRead(id: string, accountId: string): Promise<boolean>;

    countUnread(accountId: string): Promise<number>;
}
