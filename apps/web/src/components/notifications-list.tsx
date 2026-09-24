import type { NotificationDto } from '../api/notifications-api';
import { NotificationRow } from './notification-row';

export interface NotificationsListProps {
    notifications: readonly NotificationDto[];
    pendingIds: ReadonlySet<string>;
    answeringIds: ReadonlySet<string>;
    onMarkAsRead: (id: string) => Promise<void>;
    onAnswer: (notification: NotificationDto, accept: boolean) => Promise<void>;
}

export function NotificationsList({ notifications, pendingIds, answeringIds, onMarkAsRead, onAnswer }: NotificationsListProps) {
    return (
        <ul id="notifications-list" className="notifications-list">
            {notifications.map(notification => (
                <NotificationRow
                    key={notification.id}
                    notification={notification}
                    isPending={pendingIds.has(notification.id)}
                    isAnswering={answeringIds.has(notification.id)}
                    onMarkAsRead={onMarkAsRead}
                    onAnswer={onAnswer}
                />
            ))}
        </ul>
    );
}
