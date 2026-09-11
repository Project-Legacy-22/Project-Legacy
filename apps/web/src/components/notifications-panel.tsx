import { useState } from 'react';

import type { NotificationsApi } from '../api/notifications-api';
import { useNotificationsList } from '../hooks/use-notifications-list';
import { labels } from '../labels';
import { NotificationsPanelContent } from './notifications-panel-content';

export interface NotificationsPanelProps {
    api: NotificationsApi;
}

// Collapsed by default, behind the badge in the session banner: most visits
// never open it, so the list is fetched only once a caller asks for it (see
// useNotificationsList's isEnabled). Closing and reopening is also how a
// failed load is retried -- toggling isEnabled false then true runs the
// effect again, which a dedicated retry button would only duplicate.
export function NotificationsPanel({ api }: NotificationsPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const list = useNotificationsList(api, isOpen);

    return (
        <section className="notifications-panel" aria-busy={isOpen && list.loadState.status === 'loading'}>
            <button
                type="button"
                className="button button-quiet"
                aria-expanded={isOpen}
                aria-controls="notifications-panel-content"
                onClick={() => setIsOpen(current => !current)}
            >
                {isOpen ? labels.hideNotifications : labels.showNotifications}
            </button>
            {isOpen && (
                <NotificationsPanelContent
                    notifications={list.notifications}
                    loadState={list.loadState}
                    pendingIds={list.pendingIds}
                    hasNextPage={list.hasNextPage}
                    paginationState={list.paginationState}
                    onMarkAsRead={list.markAsRead}
                    onLoadMore={() => void list.loadMore()}
                    onRetry={list.retry}
                    actionError={list.actionError}
                />
            )}
        </section>
    );
}
