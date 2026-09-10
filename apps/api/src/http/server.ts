import { readFileSync } from 'node:fs';
import path from 'node:path';

import express from 'express';
import type { Express, RequestHandler } from 'express';
import type { Logger } from '@legacy/contracts';

import type { Config } from '../config.js';
import type { AppUseCases } from '../composition-root.js';
import { accountRouter } from './routes/account.js';
import { authRouter } from './routes/auth.js';
import { credentialsRouter } from './routes/credentials.js';
import { itemsRouter } from './routes/items.js';
import { notificationsRouter } from './routes/notifications.js';
import { projectsRouter } from './routes/projects.js';
import { translateErrors } from './error-middleware.js';
import { requireAccount } from './session.js';
import { withTraceId } from './trace.js';
import { logRequests } from './request-log.js';
import { securityHeaders } from './security-headers.js';
import { cors } from './cors.js';

// The largest body any route accepts is an email and a password, or a task
// title. 16 KiB leaves room for every legitimate request and rejects a payload
// meant to exhaust memory. A refusal is turned into a 413 by the error
// middleware rather than a generic 500.
const MAX_BODY_SIZE = '16kb';

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

// Changing a signed-in credential (US-36). The per-caller budget matches
// sign-in and is shared by the password change and the confirmation endpoint.
// The email change also carries a per-address budget over an hour, the same
// shape as a reset request, so one inbox cannot be flooded with confirmation
// mail.
const CREDENTIALS_MAX_ATTEMPTS = 10;
const CREDENTIALS_WINDOW_MS = 5 * 60 * 1000;
const EMAIL_CHANGES_PER_ADDRESS = 3;
const EMAIL_CHANGE_WINDOW_MS = 60 * 60 * 1000;

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

    // req.ip, and therefore the rate limiter's client key, is only as
    // trustworthy as this setting: it says how many proxy hops in front of the
    // process may set X-Forwarded-For.
    app.set('trust proxy', config.trustProxy);
    // helmet also removes it, but disabling it at the source means no code path
    // can put it back.
    app.disable('x-powered-by');

    // Before the body parser: a body that is too large or not JSON is refused
    // by express.json() with a next(error), and the error middleware needs the
    // trace id to already be on the response to report that refusal.
    app.use(withTraceId);
    app.use(securityHeaders());
    app.use(cors(config.webOrigin));
    app.use(express.json({ limit: MAX_BODY_SIZE }));
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

    // Same shape as accountRouter: the password and email changes act on the
    // caller's own account, and the confirmation endpoint is public because its
    // link is opened from an email client (US-36).
    app.use(
        credentialsRouter(useCases.auth, {
            secureCookie: config.secureCookies,
            maxAttempts: CREDENTIALS_MAX_ATTEMPTS,
            windowMs: CREDENTIALS_WINDOW_MS,
            emailChangesPerAddress: EMAIL_CHANGES_PER_ADDRESS,
            emailChangeWindowMs: EMAIL_CHANGE_WINDOW_MS,
        }),
    );

    // The reset and email-change links in the auth emails are deep links the
    // browser opens directly. Serve the app shell for them so the front-end can
    // pick up the token; every other path still falls through to the session
    // guard.
    if (appShell !== undefined) {
        const serveShell: RequestHandler = (_req, res) => {
            res.type('html').send(appShell);
        };
        app.get('/reset-password', serveShell);
        app.get('/confirm-email-change', serveShell);
    }

    // Items belong to somebody since US-11: no session, no items. The guard
    // also renews the session it is given when it can, so an hour-long access
    // token does not interrupt what somebody is doing (US-27).
    //
    // One instance for the three routers rather than one each: the guard holds
    // no state, and building it three times would only make three closures.
    const session = requireAccount(useCases.auth, config.secureCookies);

    app.use(session, projectsRouter(useCases.projects), itemsRouter(useCases.items));
    app.use(session, notificationsRouter(useCases.notifications));

    // Registered last: express only treats a middleware as an error handler
    // once every route has had its chance to fail.
    app.use(translateErrors(logger));

    return app;
}
