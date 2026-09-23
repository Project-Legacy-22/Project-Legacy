import { ProblemDetails } from '@legacy/contracts';

import { labels } from '../labels';

// What every client of this folder throws when a request did not succeed.
// `status` is the HTTP status, or NO_RESPONSE when nothing came back at all.
export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'ApiError';
    }
}

export const NO_RESPONSE = 0;

interface Answer {
    status: number;
    // The API's own explanation, when it gave one and may be shown.
    detail: string | undefined;
    traceId: string | undefined;
    retryAfterSeconds: number | undefined;
}

// The one place that decides what a failure says (#384). A refusal the API
// explains -- a missing task, a conflicting edit, a wrong current password --
// is shown in its own words, which are written for a user. A throttle or a
// failure on our side is described by its status instead: whose fault it is,
// and whether waiting helps, is what the person needs, not the server's text.
function statusSentence({ status, traceId, retryAfterSeconds }: Answer): string | undefined {
    if (status === 429) return labels.tooManyRequests(retryAfterSeconds);
    if (status === 502 || status === 503 || status === 504) return labels.serviceUnavailable(retryAfterSeconds);
    if (status >= 500) return labels.serverError(traceId);
    return undefined;
}

function withOperation(sentence: string, fallback: string | undefined): string {
    return fallback === undefined ? sentence : `${fallback} ${sentence}`;
}

// The caller's fallback names the operation ("Unable to remove the item."),
// the status sentence says why and what to do; together they answer both
// questions a person has when something fails.
export function messageFor(answer: Answer, fallback?: string): string {
    const sentence = statusSentence(answer);
    if (sentence !== undefined) return withOperation(sentence, fallback);
    if (answer.detail !== undefined) return answer.detail;
    if (answer.status === 403) return withOperation(labels.forbidden, fallback);
    return fallback ?? labels.requestFailed(answer.status);
}

function retryAfterOf(response: Response): number | undefined {
    const seconds = Number(response.headers.get('Retry-After'));
    return Number.isInteger(seconds) && seconds > 0 ? seconds : undefined;
}

async function problemOf(response: Response): Promise<ProblemDetails | undefined> {
    try {
        const parsed = ProblemDetails.safeParse(await response.json());
        return parsed.success ? parsed.data : undefined;
    } catch {
        // A body that is not JSON is a page from a proxy in front of the API,
        // not an answer from it: there is no problem document to read, and the
        // status alone decides the message.
        return undefined;
    }
}

export async function failureMessage(response: Response, fallback?: string): Promise<string> {
    const problem = await problemOf(response);
    return messageFor(
        {
            status: response.status,
            detail: problem?.detail,
            traceId: problem?.traceId,
            retryAfterSeconds: retryAfterOf(response),
        },
        fallback,
    );
}

// For the screens that must not repeat what the server said, because the
// detail could tell which addresses have an account. The status still
// explains a throttle or an outage, which discloses nothing.
export async function statusMessage(response: Response, fallback: string): Promise<string> {
    const problem = await problemOf(response);
    return messageFor(
        {
            status: response.status,
            detail: undefined,
            traceId: problem?.traceId,
            retryAfterSeconds: retryAfterOf(response),
        },
        fallback,
    );
}

// fetch rejects with a TypeError when no answer came back at all: offline,
// DNS, a connection reset. Left as it is, that error reached each screen as
// something that is not an ApiError, and each screen fell back to a sentence
// blaming the operation. An aborted request is the caller's own decision and
// passes through untouched, since every hook already ignores it.
export async function send(input: string, init?: RequestInit): Promise<Response> {
    try {
        return await fetch(input, init);
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new ApiError(NO_RESPONSE, labels.serverUnreachable, { cause: error });
    }
}
