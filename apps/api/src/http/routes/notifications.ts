import { Router } from 'express';
import type { RequestHandler } from 'express';

import { ListNotificationsQuery, NotificationIdParams } from '@legacy/contracts';
import type { NotificationSummaryDto, NotificationPageDto, NotificationDto } from '@legacy/contracts';
import type { Notification, NotificationPage } from '@legacy/core-notifications';

import type { Logger } from '@legacy/contracts';
import type { NotificationUseCases } from '../../composition-root.js';
import { accountOf } from '../session.js';

// The visible end of the event flow. Creating an item eventually produces
// one of these, without the interface asking for it and without the item
// routes knowing a notification exists.
function toNotificationDto(notification: Notification): NotificationDto {
    return {
        id: notification.id,
        itemId: notification.itemId,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
    };
}

function toNotificationPageDto(page: NotificationPage): NotificationPageDto {
    return {
        notifications: page.notifications.map(toNotificationDto),
        nextCursor: page.nextCursor ?? null,
    };
}

// Routes translate HTTP into use-case calls and back. They hold no rule of
// their own and never reach the database.
//
// Every route is mounted behind requireAccount and names that account when it
// reaches a use case: no read or write here ever crosses accounts, and a
// request aimed at somebody else's notification is answered like one aimed at
// nothing (US-18, the same posture US-12 set for items).
export function notificationsRouter(useCases: NotificationUseCases, logger: Logger): Router {
    const router = Router();

    // Une passe de livraison avant de lire. Sur une cible sans processus long,
    // rien ne fait tourner le relais : l evenement resterait dans l outbox et la
    // liste serait vide alors que la tache existe. Un echec de la passe ne doit
    // pas empecher de lire ce qui est deja la.
    const deliverFirst = async (): Promise<void> => {
        try {
            await useCases.deliverPending();
        } catch (error) {
            logger.warn({ err: error }, 'delivery pass failed, serving what is stored');
        }
    };

    const list: RequestHandler = (req, res, next) => {
        const query = ListNotificationsQuery.safeParse(req.query);
        if (!query.success) return next(query.error);

        deliverFirst()
            .then(() =>
                useCases.listNotifications(accountOf(res).id, {
                    limit: query.data.limit,
                    cursor: query.data.cursor,
                }),
            )
            .then(page => res.send(toNotificationPageDto(page)))
            .catch(next);
    };

    // A count rather than a list: the session banner shows a reminder, and a
    // list would carry identifiers it has no use for.
    const unreadCount: RequestHandler = (_req, res, next) => {
        deliverFirst()
            .then(() => useCases.countUnread(accountOf(res).id))
            .then(unread => {
                const body: NotificationSummaryDto = { unread };
                res.send(body);
            })
            .catch(next);
    };

    const markRead: RequestHandler = (req, res, next) => {
        const params = NotificationIdParams.safeParse(req.params);
        if (!params.success) return next(params.error);

        useCases
            .markNotificationRead(params.data.id, accountOf(res).id)
            .then(() => res.sendStatus(204))
            .catch(next);
    };

    router.get('/notifications', list);
    router.get('/notifications/unread-count', unreadCount);
    router.patch('/notifications/:id/read', markRead);

    return router;
}
