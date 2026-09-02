import { DomainError } from '@legacy/core-items';
import type { ErrorRequestHandler } from 'express';

// The single point where a failure becomes an HTTP response. No route sets an
// error status itself, which is what keeps the error format consistent.
//
// Shape follows RFC 7807: never a stack trace, an SQL message, or an internal
// identifier, since the body is read by the client.
interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail: string;
    instance: string;
    traceId: string;
}

export const translateErrors: ErrorRequestHandler = (error, req, res, _next) => {
    const problem: ProblemDetails =
        error instanceof DomainError
            ? {
                  type: error.code,
                  title: error.name,
                  status: error.httpStatus,
                  detail: error.message,
                  instance: req.originalUrl,
                  traceId: res.locals.traceId,
              }
            : {
                  type: 'internal_error',
                  title: 'InternalError',
                  status: 500,
                  detail: 'The request could not be processed.',
                  instance: req.originalUrl,
                  traceId: res.locals.traceId,
              };

    res.status(problem.status).json(problem);
};
