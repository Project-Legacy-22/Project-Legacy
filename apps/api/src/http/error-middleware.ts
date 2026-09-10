import { ZodError } from 'zod';
import { AuthError } from '@legacy/core-auth';
import { DomainError } from '@legacy/core-items';
import { NotificationError } from '@legacy/core-notifications';
import { ProjectError } from '@legacy/core-projects';
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
    return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
}

// Each domain names its own errors -- a core package may not import another --
// so the middleware knows all of them. They agree on three fields, which is
// what makes one translation enough.
type Reported = AuthError | DomainError | NotificationError | ProjectError | TooManyAttempts;

function isReported(error: unknown): error is Reported {
    return (
        error instanceof AuthError ||
        error instanceof DomainError ||
        error instanceof NotificationError ||
        error instanceof ProjectError ||
        error instanceof TooManyAttempts
    );
}

// express.json() rejects a body that is over the size limit or is not valid
// JSON. Its errors are tagged with a stable `type`. Without this branch they
// fall through to the generic 500 below, which both misreports a client mistake
// as a server fault and logs an "unhandled failure" for it. The detail strings
// here are fixed: a body-parser message can quote the offending input, and an
// error response must not echo what was submitted.
const BODY_ERRORS: Record<string, Omit<ProblemDetails, 'instance' | 'traceId'>> = {
    'entity.too.large': {
        type: 'payload_too_large',
        title: 'PayloadTooLarge',
        status: 413,
        detail: 'The request body is too large.',
    },
    'entity.parse.failed': {
        type: 'malformed_body',
        title: 'MalformedBody',
        status: 400,
        detail: 'The request body is not valid JSON.',
    },
};

function bodyErrorFor(error: unknown): Omit<ProblemDetails, 'instance' | 'traceId'> | undefined {
    if (typeof error !== 'object' || error === null || !('type' in error)) return undefined;
    return typeof error.type === 'string' ? BODY_ERRORS[error.type] : undefined;
}

function toProblem(error: unknown): Omit<ProblemDetails, 'instance' | 'traceId'> {
    const bodyError = bodyErrorFor(error);
    if (bodyError !== undefined) {
        return bodyError;
    }

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
            logger.warn({
                type: problem.type,
                status: problem.status,
                traceId: problem.traceId,
            });
        }

        res.status(problem.status).json(problem);
    };
}
