import { readFileSync } from 'node:fs';
import path from 'node:path';

import express from 'express';
import type { Express } from 'express';
import type { Logger } from '@legacy/contracts';

import type { Config } from '../config.js';
import type { AppUseCases } from '../composition-root.js';
import { accountRouter } from './routes/account.js';
import { authRouter } from './routes/auth.js';
import { itemsRouter } from './routes/items.js';
import { notificationsRouter } from './routes/notifications.js';
import { translateErrors } from './error-middleware.js';
import { requireAccount } from './session.js';
import { withTraceId } from './trace.js';
import { logRequests } from './request-log.js';

// Ten attempts per five minutes and per address, across sign-up and sign-in
// together. Loose enough that nobody legitimate meets it by mistyping a
// password, tight enough that guessing is not a viable strategy.
const AUTH_MAX_ATTEMPTS = 10;
const AUTH_WINDOW_MS = 5 * 60 * 1000;

// Password reset carries its own budgets. Per origin, the same shape as
// sign-in. Per address, tighter and over an hour: nobody needs three links to
// the same inbox in an hour, and it caps how far one address can be flooded.
const RESET_MAX_ATTEMPTS = 10;
const RESET_WINDOW_MS = 5 * 60 * 1000;
const RESET_REQUESTS_PER_EMAIL = 3;
const RESET_EMAIL_WINDOW_MS = 60 * 60 * 1000;

// Read once at startup, not per request: the deep link for the recovery email
// needs the app shell, and a route that hits the file system on every call
// would be one more thing to rate-limit for no reason. Absent in development,
// where Vite serves this path.
function readAppShell(staticDir: string): string | undefined {
    try {
        return readFileSync(path.join(staticDir, 'index.html'), 'utf8');
    } catch {
        return undefined;
    }
}

export function createServer(config: Config, useCases: AppUseCases, logger: Logger): Express {
    const app = express();
    const appShell = readAppShell(config.staticDir);

    app.use(express.json());
    app.use(withTraceId);
    app.use(logRequests(logger));
    app.use(express.static(config.staticDir));

    app.use(
        authRouter(useCases.auth, {
            secureCookie: config.secureCookies,
            maxAttempts: AUTH_MAX_ATTEMPTS,
            windowMs: AUTH_WINDOW_MS,
            resetMaxAttempts: RESET_MAX_ATTEMPTS,
            resetWindowMs: RESET_WINDOW_MS,
            resetRequestsPerEmail: RESET_REQUESTS_PER_EMAIL,
            resetEmailWindowMs: RESET_EMAIL_WINDOW_MS,
        }),
    );

    // Carries its own requireAccount, like GET /auth/me: exporting and erasing
    // act on the caller's own account, so they resolve it the same way.
    app.use(accountRouter(useCases.account, useCases.auth, { secureCookie: config.secureCookies }));

    // The reset link in the recovery email is a deep link the browser opens
    // directly. Serve the app shell for it so the front-end can pick up the
    // token; every other path still falls through to the session guard.
    if (appShell !== undefined) {
        app.get('/reset-password', (_req, res) => {
            res.type('html').send(appShell);
        });
    }

    // Items belong to somebody since US-11: no session, no items. The guard
    // also renews the session it is given when it can, so an hour-long access
    // token does not interrupt what somebody is doing (US-27).
    const session = requireAccount(useCases.auth, config.secureCookies);

    app.use(session, itemsRouter(useCases.items));
    app.use(session, notificationsRouter(useCases.notifications));

    // Registered last: express only treats a middleware as an error handler
    // once every route has had its chance to fail.
    app.use(translateErrors(logger));

    return app;
}
