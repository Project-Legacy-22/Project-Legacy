import {
    DEFAULT_NOTIFICATION_PAGE_SIZE,
    NotificationPageDto,
    NotificationSummaryDto,
} from '@legacy/contracts';

import { ApiError, errorMessage, requestJson } from './items-api';
import { labels } from '../labels';
import { send } from './failure';

export type { NotificationDto, NotificationPageDto } from '@legacy/contracts';

export interface ListNotificationsRequest {
    signal: AbortSignal;
    cursor?: string;
}

// The observable effect of the US-10 event flow. The front does not know that a broker or a worker
// exists: it reads a count and a list, which change because a separate component consumed the
// event.
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
        const response = await send('/notifications/unread-count', {
            headers: { Accept: 'application/json' },
            signal,
        });

        if (!response.ok) throw new ApiError(response.status, await errorMessage(response, labels.notificationsFailed));

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
        const response = await send(`/notifications/${encodeURIComponent(id)}/read`, {
            method: 'PATCH',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new ApiError(response.status, await errorMessage(response));
        }
    },
};
