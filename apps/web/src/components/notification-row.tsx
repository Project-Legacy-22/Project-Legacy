import type { NotificationDto } from '../api/notifications-api';
import { labels } from '../labels';

export interface NotificationRowProps {
    notification: NotificationDto;
    isPending: boolean;
    onMarkAsRead: (id: string) => Promise<void>;
}

export function NotificationRow({ notification, isPending, onMarkAsRead }: NotificationRowProps) {
    const isRead = notification.readAt !== null;

    return (
        <li className="notification-row">
            <p>
                {labels.notificationItemCreated}
                <span className="notification-status">
                    {isRead ? labels.notificationRead : labels.notificationUnread}
                </span>
            </p>
            <time dateTime={notification.createdAt}>
                {new Date(notification.createdAt).toLocaleString()}
            </time>
            {!isRead && (
                <button
                    type="button"
                    className="button button-quiet"
                    disabled={isPending}
                    onClick={() => void onMarkAsRead(notification.id)}
                >
                    {isPending ? labels.markingNotificationRead : labels.markNotificationRead}
                </button>
            )}
        </li>
    );
}
