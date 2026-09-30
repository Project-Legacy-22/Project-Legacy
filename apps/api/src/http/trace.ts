import { AsyncLocalStorage } from 'node:async_hooks';
import { v4 as uuid } from 'uuid';
import type { RequestHandler, Response } from 'express';

// Every response that reports an error carries a correlation identifier, so that a user's report
// can be matched with a log line without exposing anything of the request itself.
//
// Express types `res.locals` as `LocalsObj & Locals`, where `LocalsObj` defaults to `Record<string,
// any>`. Intersecting a declared field with that index signature brings it back to `any`:
// augmenting `Express.Locals` is therefore not enough to type `traceId`, and every read would be an
// unsafe access.
//
// It goes through a typed view and a runtime check. The cost is two lines; the gain is that no
// caller handles `any` any more, and that a forgotten middleware fails immediately instead of
// carrying `undefined` into a log.
interface TraceLocals {
    traceId?: unknown;
}

const MANQUANT = 'withTraceId doit etre monte avant tout usage de traceIdOf.';
const traceContext = new AsyncLocalStorage<string>();

export function currentTraceId(): string | undefined {
    return traceContext.getStore();
}

export function runWithTraceId<T>(traceId: string, work: () => T): T {
    return traceContext.run(traceId, work);
}

export const withTraceId: RequestHandler = (_req, res, next) => {
    const traceId = uuid();
    (res.locals as TraceLocals).traceId = traceId;
    runWithTraceId(traceId, next);
};

export function traceIdOf(res: Response): string {
    const { traceId } = res.locals as TraceLocals;

    if (typeof traceId !== 'string') {
        throw new Error(MANQUANT);
    }

    return traceId;
}
