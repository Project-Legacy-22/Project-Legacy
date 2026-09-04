import express from 'express';
import type { Express } from 'express';
import type { Logger } from '@legacy/contracts';

import type { Config } from '../config.js';
import type { AppUseCases } from '../composition-root.js';
import { authRouter } from './routes/auth.js';
import { itemsRouter } from './routes/items.js';
import { translateErrors } from './error-middleware.js';
import { requireAccount } from './session.js';
import { withTraceId } from './trace.js';
import { logRequests } from './request-log.js';

// Ten attempts per five minutes and per address, across sign-up and sign-in
// together. Loose enough that nobody legitimate meets it by mistyping a
// password, tight enough that guessing is not a viable strategy.
const AUTH_MAX_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 5 * 60 * 1000;

export function createServer(config: Config, useCases: AppUseCases, logger: Logger): Express {
    const app = express();

    app.use(express.json());
    app.use(withTraceId);
    app.use(logRequests(logger));
    app.use(express.static(config.staticDir));

    app.use(
        authRouter(useCases.auth, {
            secureCookie: config.secureCookies,
            maxAttempts: AUTH_MAX_ATTEMPTS,
            windowMs: AUTH_WINDOW_MS,
        }),
    );

    // Items belong to somebody since US-11: no session, no items.
    app.use(requireAccount(useCases.auth), itemsRouter(useCases.items));

    // Registered last: express only treats a middleware as an error handler
    // once every route has had its chance to fail.
    app.use(translateErrors(logger));

    return app;
}
