import type { NotificationDto } from '../api/notifications-api';
import { NotificationRow } from './notification-row';

export interface NotificationsListProps {
    notifications: readonly NotificationDto[];
    pendingIds: ReadonlySet<string>;
    onMarkAsRead: (id: string) => Promise<void>;
}

export function NotificationsList({ notifications, pendingIds, onMarkAsRead }: NotificationsListProps) {
    return (
        <ul id="notifications-list" className="notifications-list">
            {notifications.map(notification => (
                <NotificationRow
                    key={notification.id}
                    notification={notification}
                    isPending={pendingIds.has(notification.id)}
                    onMarkAsRead={onMarkAsRead}
                />
            ))}
        </ul>
    );
}
