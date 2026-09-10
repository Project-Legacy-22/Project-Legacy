import { Router } from 'express';
import type { RequestHandler } from 'express';

import type { NotificationSummaryDto } from '@legacy/contracts';

import type { NotificationUseCases } from '../../composition-root.js';
import { accountOf } from '../session.js';

// The visible end of the event flow. Creating an item eventually makes this
// count go up, without the interface asking for it and without the item routes
// knowing a notification exists.
//
// A count rather than a list: the screen shows a reminder, and a list would
// carry item identifiers it has no use for.
export function notificationsRouter(useCases: NotificationUseCases): Router {
    const router = Router();

    const summary: RequestHandler = (_req, res, next) => {
        useCases
            .countUnread(accountOf(res).id)
            .then(unread => {
                const body: NotificationSummaryDto = { unread };
                res.send(body);
            })
            .catch(next);
    };

    router.get('/notifications', summary);

    return router;
}
