// Wording of failures by cause (#384). Kept apart from labels.ts, which is at
// its line ceiling, and spread into it like the other label modules.

function delay(seconds: number): string {
    if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

export const failureLabels = {
    forbidden: 'You are not allowed to do this.',
    serverUnreachable: 'Unable to reach the server. Check your connection and try again.',
    tooManyRequests(retryAfterSeconds: number | undefined): string {
        return retryAfterSeconds === undefined
            ? 'Too many attempts. Try again in a moment.'
            : `Too many attempts. Try again in ${delay(retryAfterSeconds)}.`;
    },
    serviceUnavailable(retryAfterSeconds: number | undefined): string {
        return retryAfterSeconds === undefined
            ? 'The service is temporarily unavailable. Try again in a moment.'
            : `The service is temporarily unavailable. Try again in ${delay(retryAfterSeconds)}.`;
    },
    serverError(traceId: string | undefined): string {
        return traceId === undefined
            ? 'Something went wrong on our side. Try again.'
            : `Something went wrong on our side. Try again; if it keeps happening, quote reference ${traceId}.`;
    },
} as const;
