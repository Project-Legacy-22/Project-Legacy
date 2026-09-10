import { NotificationSummaryDto } from '@legacy/contracts';

import { ApiError } from './items-api';
import { labels } from '../labels';

// L effet observable du flux evenementiel de US-10. Le front ne sait pas qu il
// existe un broker ni un worker : il lit un compte, qui monte parce qu un
// composant distinct a consomme l evenement.
export interface NotificationsApi {
    unreadCount: (signal: AbortSignal) => Promise<number>;
}

export const notificationsApi: NotificationsApi = {
    async unreadCount(signal) {
        const response = await fetch('/notifications', {
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
};
