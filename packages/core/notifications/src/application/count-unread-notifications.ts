import type { NotificationRepository } from '../ports/notification-repository.js';

// What the session banner polls to show the reminder (US-10's visible
// effect). A pass-through, but its own file and its own name like every
// other use case: the route depends on this, never on the repository.
export function makeCountUnreadNotifications(repository: NotificationRepository) {
    return async function countUnreadNotifications(accountId: string): Promise<number> {
        return repository.countUnread(accountId);
    };
}
