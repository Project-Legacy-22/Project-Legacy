import { v4 as uuid } from 'uuid';
import type { RequestHandler } from 'express';

// Every response that reports an error carries a correlation identifier, so a
// report from a user can be tied to a log line without exposing anything about
// the request itself. Express declares Express.Locals as an empty interface
// precisely so that applications can augment it, which is what types
// res.locals.traceId below.
declare global {
    namespace Express {
        interface Locals {
            traceId: string;
        }
    }
}

export const withTraceId: RequestHandler = (_req, res, next) => {
    res.locals.traceId = uuid();
    next();
};
