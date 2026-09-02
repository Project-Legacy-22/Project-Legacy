import type { Logger } from '@legacy/infra';
import type { RequestHandler } from 'express';

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
                path: req.route === undefined ? req.path : req.originalUrl,
                status: res.statusCode,
                durationMs: Math.round(durationMs * 100) / 100,
                traceId: res.locals.traceId,
            });
        });

        next();
    };
}
