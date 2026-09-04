import { SessionRequired } from '@legacy/core-auth';
import type { Account, Session } from '@legacy/core-auth';
import type { RequestHandler, Response } from 'express';

import type { AuthUseCases } from '../composition-root.js';
import { readCookie } from './cookies.js';

export const SESSION_COOKIE = 'session';

// The token travels in an httpOnly cookie, so no script in the page can read
// it: that is exactly what US-11 asks for, and it is not what a browser
// Supabase client does by default. SameSite=Lax keeps the cookie off cross-site
// requests while an ordinary navigation still carries it.
//
// `secure` is a parameter rather than a constant because a cookie marked secure
// is dropped by the browser over plain http, which is how the app is served in
// development.
export function setSessionCookie(res: Response, session: Session, secure: boolean): void {
    res.cookie(SESSION_COOKIE, session.accessToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/',
        maxAge: session.expiresInSeconds * 1000,
    });
}

// Same shape as trace.ts, for the same reason: express types res.locals through
// an index signature that collapses a declared field back to `any`, so the
// value travels through a typed view and is checked on the way out.
interface AccountLocals {
    account?: unknown;
}

const MANQUANT = 'requireAccount doit etre monte avant tout usage de accountOf.';

function isAccount(value: unknown): value is Account {
    if (typeof value !== 'object' || value === null) return false;

    // The assertion only tells the compiler which fields to look at; their
    // types are checked on the next line.
    const { id, email } = value as Partial<Account>;

    return typeof id === 'string' && typeof email === 'string';
}

export function accountOf(res: Response): Account {
    const { account } = res.locals as AccountLocals;

    if (!isAccount(account)) throw new Error(MANQUANT);

    return account;
}

// Refuses a request no valid session backs, and resolves who the caller is when
// one does. Everything mounted behind it can assume an identity instead of
// falling back to a default one.
export function requireAccount(useCases: AuthUseCases): RequestHandler {
    return (req, res, next) => {
        const token = readCookie(req.headers.cookie, SESSION_COOKIE);

        if (token === undefined) return next(new SessionRequired());

        useCases
            .identifyCaller(token)
            .then(account => {
                if (account === undefined) return next(new SessionRequired());

                (res.locals as AccountLocals).account = account;
                next();
            })
            .catch(next);
    };
}
