// A dependency we do not own -- the identity provider, the database behind
// PostgREST, the broker -- turned a request down for a reason that passes: it
// throttled us, it did not answer in time, or it could not be reached. That is
// neither a bug of ours nor a mistake of the caller, and a 500 said both. A 503
// with a delay tells the client the truth: nothing is wrong with the request,
// and asking again later is the right move (#383).
//
// Declared here rather than beside the adapters because the HTTP layer has to
// recognise it and may not import an adapter; contracts is the package both
// already depend on.
export type Unavailability = 'rate_limited' | 'timed_out' | 'unreachable';

// A throttle holds for a window we are not told; a timeout or an unreachable
// host is usually gone within seconds. Short enough that nobody waits for
// nothing, long enough that a retry does not feed the throttle it hit.
const RETRY_AFTER_SECONDS: Readonly<Record<Unavailability, number>> = {
    rate_limited: 30,
    timed_out: 5,
    unreachable: 5,
};

export class ServiceUnavailable extends Error {
    readonly code = 'service_unavailable';
    readonly httpStatus = 503;
    readonly retryAfterSeconds: number;

    // The message is what reaches the client, so it names no dependency and no
    // operation. Those stay on the instance and in its cause, for the log.
    constructor(
        readonly reason: Unavailability,
        readonly operation: string,
        options?: ErrorOptions,
    ) {
        super('The service is temporarily unavailable. Try again shortly.', options);
        this.name = 'ServiceUnavailable';
        this.retryAfterSeconds = RETRY_AFTER_SECONDS[reason];
    }
}
