import type { NotificationDto } from '../api/notifications-api';
import type { Feedback } from '../hooks/view-state';
import type { NotificationsLoadState, NotificationsPaginationState } from '../hooks/notifications-state';
import { labels } from '../labels';
import { ActionFeedback } from './action-feedback';
import { NotificationsList } from './notifications-list';
import { NotificationsPagination } from './notifications-pagination';
import { ViewState } from './view-state';

export interface NotificationsPanelContentProps {
    notifications: readonly NotificationDto[];
    loadState: NotificationsLoadState;
    pendingIds: ReadonlySet<string>;
    answeringIds: ReadonlySet<string>;
    answerFeedback: Feedback;
    hasNextPage: boolean;
    paginationState: NotificationsPaginationState;
    onMarkAsRead: (id: string) => Promise<void>;
    onAnswer: (notification: NotificationDto, accept: boolean) => Promise<void>;
    onLoadMore: () => void;
    onRetry: () => void;
    actionError: string | null;
}

export function NotificationsPanelContent({
    notifications,
    loadState,
    pendingIds,
    answeringIds,
    answerFeedback,
    hasNextPage,
    paginationState,
    onMarkAsRead,
    onAnswer,
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
            <ActionFeedback feedback={answerFeedback} />
            <ViewState
                state={loadState}
                loadingMessage={labels.loadingNotifications}
                empty={{
                    isEmpty: notifications.length === 0,
                    message: labels.emptyNotifications,
                    // The only thing that fills this list is somebody else
                    // acting, so there is no action to offer the person
                    // reading it. Said here rather than left out, so a
                    // missing action cannot pass for an oversight.
                    unfillable: 'Notifications arrive from tasks and project invitations, not from this screen.',
                }}
                onRetry={onRetry}
            >
                <NotificationsList
                    notifications={notifications}
                    pendingIds={pendingIds}
                    answeringIds={answeringIds}
                    onMarkAsRead={onMarkAsRead}
                    onAnswer={onAnswer}
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
