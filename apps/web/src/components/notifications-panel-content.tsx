import type { NotificationDto } from '../api/notifications-api';
import type { NotificationsLoadState, NotificationsPaginationState } from '../hooks/notifications-state';
import { labels } from '../labels';
import { NotificationsList } from './notifications-list';
import { NotificationsPagination } from './notifications-pagination';
import { ViewState } from './view-state';

export interface NotificationsPanelContentProps {
    notifications: readonly NotificationDto[];
    loadState: NotificationsLoadState;
    pendingIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: NotificationsPaginationState;
    onMarkAsRead: (id: string) => Promise<void>;
    onLoadMore: () => void;
    onRetry: () => void;
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
    onRetry,
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
            <ViewState
                state={loadState}
                loadingMessage={labels.loadingNotifications}
                empty={{
                    isEmpty: notifications.length === 0,
                    message: labels.emptyNotifications,
                    // The only thing that fills this list is somebody else
                    // acting on a task, so there is no action to offer the
                    // person reading it. Said here rather than left out, so a
                    // missing action cannot pass for an oversight.
                    unfillable: 'Notifications arrive from task events, not from this screen.',
                }}
                onRetry={onRetry}
            >
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
            </ViewState>
        </div>
    );
}
