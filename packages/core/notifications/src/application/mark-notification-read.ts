import { NotificationNotFound } from '../domain/notification.js';
import type { NotificationRepository } from '../ports/notification-repository.js';

// Idempotent by construction: the repository reports "found and owned" the
// same way whether this call is the one that set readAt or the notification
// was already read, so calling this twice on the same id is not an error.
export function makeMarkNotificationRead(repository: NotificationRepository) {
    return async function markNotificationRead(id: string, accountId: string): Promise<void> {
        const found = await repository.markAsRead(id, accountId);
        if (!found) {
            throw new NotificationNotFound(id);
        }
    };
}
