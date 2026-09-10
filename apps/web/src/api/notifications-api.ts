import {
    DEFAULT_NOTIFICATION_PAGE_SIZE,
    NotificationPageDto,
    NotificationSummaryDto,
} from '@legacy/contracts';

import { ApiError, errorMessage, requestJson } from './items-api';
import { labels } from '../labels';

export type { NotificationDto, NotificationPageDto } from '@legacy/contracts';

export interface ListNotificationsRequest {
    signal: AbortSignal;
    cursor?: string;
}

// L effet observable du flux evenementiel de US-10. Le front ne sait pas qu il
// existe un broker ni un worker : il lit un compte et une liste, qui evoluent
// parce qu un composant distinct a consomme l evenement.
export interface NotificationsApi {
    unreadCount: (signal: AbortSignal) => Promise<number>;
    listNotifications: (request: ListNotificationsRequest) => Promise<NotificationPageDto>;
    markAsRead: (id: string) => Promise<void>;
}

function notificationsPath(cursor?: string): string {
    const query = new URLSearchParams({ limit: String(DEFAULT_NOTIFICATION_PAGE_SIZE) });
    if (cursor !== undefined) query.set('cursor', cursor);
    return `/notifications?${query.toString()}`;
}

export const notificationsApi: NotificationsApi = {
    async unreadCount(signal) {
        const response = await fetch('/notifications/unread-count', {
            headers: { Accept: 'application/json' },
            signal,
        });

        if (!response.ok) throw new ApiError(response.status, labels.notificationsFailed);

        try {
            return NotificationSummaryDto.parse(await response.json()).unread;
        } catch {
            throw new ApiError(502, labels.unreadableResponse);
        }
    },

    listNotifications({ signal, cursor }) {
        return requestJson(
            notificationsPath(cursor),
            { headers: { Accept: 'application/json' }, signal },
            value => {
                const result = NotificationPageDto.safeParse(value);
                if (!result.success) throw new ApiError(502, labels.invalidNotificationList);
                return result.data;
            },
        );
    },

    async markAsRead(id) {
        const response = await fetch(`/notifications/${encodeURIComponent(id)}/read`, {
            method: 'PATCH',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new ApiError(response.status, await errorMessage(response));
        }
    },
};
