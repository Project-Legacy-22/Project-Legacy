import type { Logger } from '@legacy/contracts';
import type { Request, RequestHandler } from 'express';

import { traceIdOf } from './trace.js';

// A query param the request path may carry a user's own content in, unlike
// limit/cursor/status/priority/dueDate, which are bounded or already opaque.
// US-32's search term is the first of these; redacted here rather than
// dropped, so pagination and filter values stay visible for debugging.
const SENSITIVE_QUERY_PARAMS = ['search'];

function loggedPath(req: Request): string {
    if (req.route === undefined) return req.path;

    const [path, query] = req.originalUrl.split('?');
    if (query === undefined || query.length === 0) return req.originalUrl;

    const params = new URLSearchParams(query);
    for (const name of SENSITIVE_QUERY_PARAMS) {
        if (params.has(name)) params.set(name, '[redacted]');
    }
    return `${path}?${params.toString()}`;
}

// One line per request, written when the response is done so it can carry the
// status and the duration.
//
// Method, path, status, duration and the correlation id are identifiers and
// measurements. The body is never touched: the name of an item is user content
// and has no place in a log.
export function logRequests(logger: Logger): RequestHandler {
    return (req, res, next) => {
        const startedAt = process.hrtime.bigint();

        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

            logger.info({
                method: req.method,
                path: loggedPath(req),
                status: res.statusCode,
                durationMs: Math.round(durationMs * 100) / 100,
                traceId: traceIdOf(res),
            });
        });

        next();
    };
}
