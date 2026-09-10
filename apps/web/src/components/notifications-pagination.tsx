import type { NotificationsPaginationState } from '../hooks/notifications-state';
import { labels } from '../labels';

export interface NotificationsPaginationProps {
    hasNextPage: boolean;
    state: NotificationsPaginationState;
    onLoadMore: () => void;
}

function buttonLabel(state: NotificationsPaginationState, hasNextPage: boolean): string {
    if (state.status === 'loading') return labels.loadingMoreNotifications;
    if (!hasNextPage) return labels.allNotificationsLoaded;
    return state.status === 'error' ? labels.retryLoadingMoreNotifications : labels.loadMoreNotifications;
}

function statusMessage(state: NotificationsPaginationState): string {
    if (state.status === 'loading') return labels.loadingMoreNotifications;
    return state.status === 'idle' ? state.announcement : '';
}

export function NotificationsPagination({ hasNextPage, state, onLoadMore }: NotificationsPaginationProps) {
    const hasLoadedPage = state.status === 'idle' && state.announcement !== '';
    const showButton = hasNextPage || hasLoadedPage || state.status !== 'idle';
    const isUnavailable = state.status === 'loading' || !hasNextPage;

    return (
        <div className="notifications-pagination">
            {state.status === 'error' && (
                <p id="notifications-pagination-error" className="pagination-error" role="alert">
                    {state.message}
                </p>
            )}
            {showButton && (
                <button
                    className="button button-secondary"
                    type="button"
                    aria-controls="notifications-list"
                    aria-describedby={
                        state.status === 'error' ? 'notifications-pagination-error' : undefined
                    }
                    aria-disabled={isUnavailable}
                    onClick={isUnavailable ? undefined : onLoadMore}
                >
                    {buttonLabel(state, hasNextPage)}
                </button>
            )}
            <p className="visually-hidden pagination-status" aria-live="polite" aria-atomic="true">
                {statusMessage(state)}
            </p>
        </div>
    );
}
