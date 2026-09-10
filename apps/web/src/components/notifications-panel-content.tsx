import type { NotificationDto } from '../api/notifications-api';
import type { NotificationsLoadState, NotificationsPaginationState } from '../hooks/notifications-state';
import { labels } from '../labels';
import { NotificationsList } from './notifications-list';
import { NotificationsPagination } from './notifications-pagination';

export interface NotificationsPanelContentProps {
    notifications: readonly NotificationDto[];
    loadState: NotificationsLoadState;
    pendingIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: NotificationsPaginationState;
    onMarkAsRead: (id: string) => Promise<void>;
    onLoadMore: () => void;
    actionError: string | null;
}

export function NotificationsPanelContent({
    notifications,
    loadState,
    pendingIds,
    hasNextPage,
    paginationState,
    onMarkAsRead,
    onLoadMore,
    actionError,
}: NotificationsPanelContentProps) {
    return (
        <div id="notifications-panel-content">
            <h2 id="notifications-heading">{labels.notificationsTitle}</h2>
            {actionError !== null && (
                <p className="error-message" role="alert">
                    {actionError}
                </p>
            )}
            {loadState.status === 'loading' && (
                <p className="status-message" role="status">
                    {labels.loadingNotifications}
                </p>
            )}
            {loadState.status === 'error' && (
                <p className="error-message" role="alert">
                    {loadState.message}
                </p>
            )}
            {loadState.status === 'ready' && notifications.length === 0 && (
                <p className="empty-message">{labels.emptyNotifications}</p>
            )}
            {loadState.status === 'ready' && notifications.length > 0 && (
                <>
                    <NotificationsList
                        notifications={notifications}
                        pendingIds={pendingIds}
                        onMarkAsRead={onMarkAsRead}
                    />
                    <NotificationsPagination
                        hasNextPage={hasNextPage}
                        state={paginationState}
                        onLoadMore={onLoadMore}
                    />
                </>
            )}
        </div>
    );
}
