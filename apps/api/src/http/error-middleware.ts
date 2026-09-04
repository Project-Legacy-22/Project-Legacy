import { ZodError } from 'zod';
import { AuthError } from '@legacy/core-auth';
import { DomainError } from '@legacy/core-items';
import type { Logger, ProblemDetails } from '@legacy/contracts';
import type { ErrorRequestHandler } from 'express';

import { TooManyAttempts } from './rate-limit.js';
import { traceIdOf } from './trace.js';

// The single point where a failure becomes an HTTP response. No route sets an
// error status itself, which is what keeps the error format consistent.
//
// Only the field paths and the reason are reported, never the value that was
// submitted: an error body must not echo back what a user typed.
function describe(error: ZodError): string {
    return error.issues.map(issue => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

// Each domain names its own errors -- a core package may not import another --
// so the middleware knows all of them. They agree on three fields, which is
// what makes one translation enough.
type Reported = AuthError | DomainError | TooManyAttempts;

function isReported(error: unknown): error is Reported {
    return (
        error instanceof AuthError ||
        error instanceof DomainError ||
        error instanceof TooManyAttempts
    );
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

    if (isReported(error)) {
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
    // Express type le premier parametre en `any`. L annoter en `unknown` est
    // accepte et rend le contrat honnete : rien ne garantit ce qui est passe a
    // next(), et toProblem le reduit deja explicitement.
    return (error: unknown, req, res, _next) => {
        const problem: ProblemDetails = {
            ...toProblem(error),
            instance: req.originalUrl,
            traceId: traceIdOf(res),
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
