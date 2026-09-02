import { ZodError } from 'zod';
import { DomainError } from '@legacy/core-items';
import type { Logger } from '@legacy/contracts';
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

// Only the field paths and the reason are reported, never the value that was
// submitted: an error body must not echo back what a user typed.
function describe(error: ZodError): string {
    return error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

function toProblem(error: unknown): Omit<ProblemDetails, 'instance' | 'traceId'> {
    if (error instanceof ZodError) {
        return {
            type: 'validation_error',
            title: 'ValidationError',
            status: 400,
            detail: describe(error),
        };
    }

    if (error instanceof DomainError) {
        return {
            type: error.code,
            title: error.name,
            status: error.httpStatus,
            detail: error.message,
        };
    }

    return {
        type: 'internal_error',
        title: 'InternalError',
        status: 500,
        detail: 'The request could not be processed.',
    };
}

export function translateErrors(logger: Logger): ErrorRequestHandler {
    return (error, req, res, _next) => {
        const problem: ProblemDetails = {
            ...toProblem(error),
            instance: req.originalUrl,
            traceId: res.locals.traceId,
        };

        // An expected refusal is not an incident: only a failure we did not
        // model is worth waking someone up for, and only it carries the cause.
        if (problem.status >= 500) {
            logger.error({ err: error, traceId: problem.traceId }, 'unhandled failure');
        } else {
            logger.warn({ type: problem.type, status: problem.status, traceId: problem.traceId });
        }

        res.status(problem.status).json(problem);
    };
}
