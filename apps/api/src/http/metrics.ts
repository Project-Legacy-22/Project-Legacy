import { Router } from 'express';
import type { Request, RequestHandler } from 'express';

import type { Metrics, StateValue } from '@legacy/contracts';

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

// One flat object, one field per series.
//
// Flat because a dashboard datasource reads a row of columns: nested under an
// object, each panel would need a path expression instead of a column name.
// The series keep the names the exposition gives them, so a reviewer can see
// panel by panel that the live source and the historical one measure the same
// thing.
//
// A label becomes a field of its own, prefixed by its series. legacy22_build_info
// carries the commit, the branch and the environment that way -- its value is
// always 1 and says nothing, the labels are the measurement.
function asRow(values: readonly StateValue[]): Record<string, number | string> {
    const row: Record<string, number | string> = {};

    for (const one of values) {
        row[one.name] = one.value;
        for (const [label, text] of Object.entries(one.labels ?? {})) {
            row[`${one.name}_${label}`] = text;
        }
    }

    return row;
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

    // Read by the dashboard datasource on every refresh, which is what makes
    // the figures live: nothing has to have pushed them beforehand. The
    // exposition above stays, and remains what builds the history -- a
    // datasource that is queried keeps nothing.
    const serveState: RequestHandler = (req, res, next) => {
        if (req.headers['x-relay-secret'] !== secret) {
            res.status(403).send({ type: 'forbidden', title: 'Forbidden', status: 403 });
            return;
        }

        metrics
            .state()
            .then(values => {
                // No caching: a dashboard asking for the current state must
                // not be served a minute-old copy by a proxy in between.
                res.set('cache-control', 'no-store').json(asRow(values));
            })
            .catch(next);
    };

    router.get('/internal/metrics', serve);
    router.get('/internal/state', serveState);

    return router;
}
