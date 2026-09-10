import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { NotificationDto, NotificationsApi } from '../api/notifications-api';
import { labels } from '../labels';
import type { NotificationsLoadState, NotificationsPaginationState } from './notifications-state';

type SetNotifications = Dispatch<SetStateAction<readonly NotificationDto[]>>;

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function messageFor(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

// Split out of useNotificationsList to keep that hook under the project's
// line-per-function ceiling, like useItemPagination in use-items-query.ts.
function useNotificationsPagination(api: NotificationsApi, setNotifications: SetNotifications) {
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [paginationState, setPaginationState] = useState<NotificationsPaginationState>({
        status: 'idle',
        announcement: '',
    });
    const requestController = useRef<AbortController | null>(null);

    const loadMore = useCallback(async () => {
        if (nextCursor === null || requestController.current !== null) return;
        const controller = new AbortController();
        requestController.current = controller;
        setPaginationState({ status: 'loading' });

        try {
            const page = await api.listNotifications({ signal: controller.signal, cursor: nextCursor });
            if (controller.signal.aborted) return;
            setNotifications(current => {
                const knownIds = new Set(current.map(n => n.id));
                return [...current, ...page.notifications.filter(n => !knownIds.has(n.id))];
            });
            setNextCursor(page.nextCursor);
            setPaginationState({
                status: 'idle',
                announcement: labels.notificationsLoaded(page.notifications.length),
            });
        } catch (error) {
            if (controller.signal.aborted || isAbortError(error)) return;
            const message = messageFor(error, labels.loadMoreNotificationsFailed);
            setPaginationState({ status: 'error', message });
        } finally {
            if (requestController.current === controller) requestController.current = null;
        }
    }, [api, nextCursor, setNotifications]);

    // Called when a fresh initial load starts (the panel just (re)opened): any
    // load-more still in flight from a previous opening is for a page that no
    // longer exists once the list is reloaded, and letting it land later would
    // append a stale page onto the fresh one.
    const reset = useCallback(() => {
        requestController.current?.abort();
        requestController.current = null;
        setNextCursor(null);
        setPaginationState({ status: 'idle', announcement: '' });
    }, []);

    return { setNextCursor, reset, hasNextPage: nextCursor !== null, paginationState, loadMore };
}

// Split out of useNotificationsList for the same reason as the pagination
// hook above. Idempotent on the server, so a second click while the first is
// still in flight is harmless; the pending state exists to say so, not to
// guard against it.
function useMarkNotificationRead(api: NotificationsApi, setNotifications: SetNotifications) {
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
    const [actionError, setActionError] = useState<string | null>(null);

    const markAsRead = useCallback(
        async (id: string) => {
            setPendingIds(current => new Set(current).add(id));
            setActionError(null);

            try {
                await api.markAsRead(id);
                setNotifications(current =>
                    current.map(n => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
                );
            } catch (error) {
                setActionError(messageFor(error, labels.markNotificationReadFailed));
            } finally {
                setPendingIds(current => {
                    const next = new Set(current);
                    next.delete(id);
                    return next;
                });
            }
        },
        [api, setNotifications],
    );

    return { pendingIds, markAsRead, actionError };
}

// Fetched only while the panel is open (isEnabled): a visitor who never opens
// it never pays for a list they do not look at, unlike the unread count in
// use-notifications.ts, which is visible on the banner at all times.
export function useNotificationsList(api: NotificationsApi, isEnabled: boolean) {
    const [notifications, setNotifications] = useState<readonly NotificationDto[]>([]);
    const [loadState, setLoadState] = useState<NotificationsLoadState>({ status: 'loading' });
    const pagination = useNotificationsPagination(api, setNotifications);
    const readAction = useMarkNotificationRead(api, setNotifications);

    useEffect(() => {
        if (!isEnabled) return;

        const controller = new AbortController();
        pagination.reset();
        setLoadState({ status: 'loading' });

        api.listNotifications({ signal: controller.signal })
            .then(page => {
                if (controller.signal.aborted) return;
                setNotifications(page.notifications);
                pagination.setNextCursor(page.nextCursor);
                setLoadState({ status: 'ready' });
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted || isAbortError(error)) return;
                setLoadState({ status: 'error', message: messageFor(error, labels.loadNotificationsFailed) });
            });

        return () => controller.abort();
    }, [api, isEnabled, pagination.reset, pagination.setNextCursor]);

    return {
        notifications,
        loadState,
        hasNextPage: pagination.hasNextPage,
        paginationState: pagination.paginationState,
        loadMore: pagination.loadMore,
        pendingIds: readAction.pendingIds,
        markAsRead: readAction.markAsRead,
        actionError: readAction.actionError,
    };
}
