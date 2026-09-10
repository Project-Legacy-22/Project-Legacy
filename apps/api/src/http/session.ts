import { SessionExpired, SessionRequired } from '@legacy/core-auth';
import type { Account, AuthError, Session } from '@legacy/core-auth';
import type { Request, RequestHandler, Response } from 'express';

import type { AuthUseCases } from '../composition-root.js';
import { readCookie } from './cookies.js';

export const SESSION_COOKIE = 'session';
const REFRESH_COOKIE = 'refresh';

// A day without a single request ends the session: the browser stops holding
// the refresh cookie and the next visit starts at the sign-in screen. Every
// renewal writes the cookie again, so somebody who comes back the next morning
// never meets this bound, and a tab left open on a shared machine does (US-27).
//
// The browser enforces it, not the provider: a refresh token GoTrue issued
// stays exchangeable until it is spent or its session is revoked. The bound
// belongs to the cookie because the cookie is where this session lives.
const MAX_IDLE_MS = 24 * 60 * 60 * 1000;

// Both cookies carry the same attributes, and clearing one only works if they
// match what was written, path included -- otherwise the browser keeps the
// original and the page carries on sending a token nothing will honour.
//
// httpOnly on both: no script in the page can read either. US-11 asked it of
// the access token, US-27 asks it of the refresh token, which is the more
// valuable of the two since it is what mints the other. SameSite=Lax keeps them
// off cross-site requests while an ordinary navigation still carries them.
//
// `secure` is a parameter rather than a constant because a cookie marked secure
// is dropped by the browser over plain http, which is how the app is served in
// development.
function attributesOf(secure: boolean) {
    return { httpOnly: true, sameSite: 'lax', secure, path: '/' } as const;
}

export function setSessionCookies(res: Response, session: Session, secure: boolean): void {
    const attributes = attributesOf(secure);

    res.cookie(SESSION_COOKIE, session.accessToken, {
        ...attributes,
        maxAge: session.expiresInSeconds * 1000,
    });
    // Deliberately outlives the access token: it is what the session is made of
    // between two visits, and its own lifetime is the inactivity bound.
    res.cookie(REFRESH_COOKIE, session.refreshToken, { ...attributes, maxAge: MAX_IDLE_MS });
}

// Drops what the browser holds, so the interface stops presenting a session
// that is over. Erasure (US-13) calls it because the account is gone; the guard
// below calls it because nothing is left to renew.
export function clearSessionCookies(res: Response, secure: boolean): void {
    const attributes = attributesOf(secure);

    res.clearCookie(SESSION_COOKIE, attributes);
    res.clearCookie(REFRESH_COOKIE, attributes);
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

interface Admission {
    useCases: AuthUseCases;
    secureCookie: boolean;
}

// Resolves to the refusal to report, or to undefined when the request may carry
// on. A refusal is a value rather than a throw because it is the ordinary
// answer to an ordinary request; only a real failure, the provider being
// unreachable, rejects.
async function admit(
    req: Request,
    res: Response,
    { useCases, secureCookie }: Admission,
): Promise<AuthError | undefined> {
    const accessToken = readCookie(req.headers.cookie, SESSION_COOKIE);

    if (accessToken !== undefined) {
        const account = await useCases.identifyCaller(accessToken);

        if (account !== undefined) {
            (res.locals as AccountLocals).account = account;
            return undefined;
        }
    }

    const refreshToken = readCookie(req.headers.cookie, REFRESH_COOKIE);

    if (refreshToken === undefined) return new SessionRequired();

    // The access token is gone or is no longer accepted, and the browser still
    // holds something that outlives it. Renewing here, on the request that was
    // already being made, is what keeps an hour-long token from putting the
    // sign-in screen in front of somebody every hour (US-27).
    const session = await useCases.renewSession(refreshToken);

    if (session === undefined) {
        // Dropping the cookies matters as much as the status: a browser that
        // kept them would present them again on every request for a day, and
        // the interface would keep believing a session is live.
        clearSessionCookies(res, secureCookie);
        return new SessionExpired();
    }

    setSessionCookies(res, session, secureCookie);
    (res.locals as AccountLocals).account = session.account;
    return undefined;
}

// Refuses a request no valid session backs, renews the one that can be renewed,
// and resolves who the caller is. Everything mounted behind it can assume an
// identity instead of falling back to a default one.
export function requireAccount(useCases: AuthUseCases, secureCookie: boolean): RequestHandler {
    return (req, res, next) => {
        // next(undefined) lets the request through and next(error) sends it to
        // the error middleware, which is why both outcomes end the same way.
        void admit(req, res, { useCases, secureCookie }).then(
            refusal => {
                next(refusal);
            },
            (failure: unknown) => {
                next(failure);
            },
        );
    };
}
