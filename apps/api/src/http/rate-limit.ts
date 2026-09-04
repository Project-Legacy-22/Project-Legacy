import type { RequestHandler } from 'express';

// Not a domain rule: nothing about an account changes because a caller went too
// fast. It carries the same three fields the error middleware reads on a domain
// error, so it becomes a response the same way.
export class TooManyAttempts extends Error {
    readonly code = 'too_many_attempts';
    readonly httpStatus = 429;

    constructor() {
        super('Too many attempts. Try again later.');
        this.name = 'TooManyAttempts';
    }
}

export interface RateLimitOptions {
    maxAttempts: number;
    windowMs: number;
    now?: () => number;
}

// Beyond this many distinct clients in one window, expired entries are swept.
// Without it the map would grow with every address seen since boot.
const MAX_TRACKED_CLIENTS = 10_000;

// Fixed windows per client address, held in this process. Enough for the single
// instance the project deploys; a store shared between instances belongs to
// EN-29. Supabase applies its own limit to sign-up and sign-in, but a refusal
// that only exists at the provider cannot be tested here and would not cover an
// endpoint we add ourselves.
//
// The clock is injected so a test can move time instead of waiting for it.
export function rateLimit(options: RateLimitOptions): RequestHandler {
    const { maxAttempts, windowMs, now = Date.now } = options;
    const windows = new Map<string, { startedAt: number; attempts: number }>();

    function sweep(at: number): void {
        for (const [client, window] of windows) {
            if (at - window.startedAt >= windowMs) windows.delete(client);
        }
    }

    return (req, _res, next) => {
        const at = now();
        // req.ip is only as trustworthy as the proxy configuration in front of
        // it. Declaring that trust is EN-29's job.
        const client = req.ip ?? 'unknown';
        const current = windows.get(client);

        if (current === undefined || at - current.startedAt >= windowMs) {
            if (windows.size >= MAX_TRACKED_CLIENTS) sweep(at);
            windows.set(client, { startedAt: at, attempts: 1 });
            return next();
        }

        current.attempts += 1;
        next(current.attempts > maxAttempts ? new TooManyAttempts() : undefined);
    };
}
