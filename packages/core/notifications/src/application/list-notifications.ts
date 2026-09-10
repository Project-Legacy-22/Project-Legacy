import type {
    NotificationPage,
    NotificationPageQuery,
    NotificationRepository,
} from '../ports/notification-repository.js';

// The caller is an argument, like the owner of a page of items: the list is
// the caller's own notifications and nothing else.
export function makeListNotifications(repository: NotificationRepository) {
    return async function listNotifications(
        accountId: string,
        page: NotificationPageQuery,
    ): Promise<NotificationPage> {
        return repository.findPageForAccount(accountId, page);
    };
}
