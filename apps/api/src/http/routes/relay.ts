import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';
import type { Request, RequestHandler } from 'express';

import type { NotificationUseCases } from '../../composition-root.js';

const HEADER = 'x-relay-secret';

// The scheduled trigger for a target where nothing runs between requests.
//
// It is not a session route: the caller is a workflow, not a person, so it
// presents a shared secret instead. Without RELAY_SECRET configured the route
// is not mounted at all -- a deployment that keeps the relay running on a timer
// has nothing to trigger, and an endpoint that exists only to answer 403 tells
// a scanner it is there.
function presentedSecret(req: Request): string {
    const header = req.headers[HEADER];
    return typeof header === 'string' ? header : '';
}

// Constant-time, and length-guarded: timingSafeEqual throws on a length
// mismatch, which would itself leak the length.
function matches(presented: string, expected: string): boolean {
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);

    return a.length === b.length && timingSafeEqual(a, b);
}

export function relayRouter(useCases: NotificationUseCases, secret: string): Router {
    const router = Router();

    const trigger: RequestHandler = (req, res, next) => {
        if (!matches(presentedSecret(req), secret)) {
            res.status(403).send({ type: 'forbidden', title: 'Forbidden', status: 403 });
            return;
        }

        useCases
            .deliverPending()
            .then(result => res.send(result))
            .catch(next);
    };

    router.post('/internal/relay', trigger);

    return router;
}
