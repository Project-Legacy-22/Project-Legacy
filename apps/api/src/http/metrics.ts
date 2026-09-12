import { Router } from 'express';
import type { Request, RequestHandler } from 'express';

import type { Metrics } from '@legacy/contracts';

// A segment that identifies something: a UUID, or a number. Replaced by a
// marker, never kept.
const IDENTIFIER = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/iu;

// The route pattern, not the path that was received.
//
// Express only sets `req.route` once routing succeeded, so a request turned
// away by the session guard has none -- and that is the most frequent case on
// this service. Falling back to a fixed value would collapse every refusal
// into a single bucket and lose which route was called; falling back to the
// raw path would carry identifiers into the labels. The path is therefore
// sanitised segment by segment.
export function routePattern(req: Request): string {
    const route: unknown = (req as { route?: { path?: unknown } }).route?.path;

    if (typeof route === 'string' && route !== '') {
        return `${req.baseUrl}${route}`;
    }

    return req.path
        .split('/')
        .map(segment => (IDENTIFIER.test(segment) ? ':id' : segment))
        .join('/');
}

export function observeRequests(metrics: Metrics): RequestHandler {
    return (req, res, next) => {
        const start = process.hrtime.bigint();

        res.on('finish', () => {
            metrics.observe({
                method: req.method,
                route: routePattern(req),
                status: res.statusCode,
                seconds: Number(process.hrtime.bigint() - start) / 1e9,
            });
        });

        next();
    };
}

// The same secret as the relay trigger. These measurements carry no personal
// data, but they describe the inside of the service: exposing them publicly
// would teach a stranger which routes exist and which one is slow.
export function metricsRouter(metrics: Metrics, secret: string): Router {
    const router = Router();

    const serve: RequestHandler = (req, res, next) => {
        if (req.headers['x-relay-secret'] !== secret) {
            res.status(403).send({ type: 'forbidden', title: 'Forbidden', status: 403 });
            return;
        }

        metrics
            .render()
            .then(({ contentType, body }) => {
                res.type(contentType).send(body);
            })
            .catch(next);
    };

    router.get('/internal/metrics', serve);

    return router;
}
