import {
    RegisterAccountBody,
    RequestPasswordResetBody,
    ResetPasswordBody,
    SignInBody,
} from '@legacy/contracts';
import type { AccountDto } from '@legacy/contracts';
import { normalizeEmailAddress } from '@legacy/core-auth';
import type { Account } from '@legacy/core-auth';
import { Router } from 'express';
import type { RequestHandler } from 'express';

import type { AuthUseCases } from '../../composition-root.js';
import { readCookie } from '../cookies.js';
import { rateLimit } from '../rate-limit.js';
import { SESSION_COOKIE, accountOf, clearSessionCookie, requireAccount, setSessionCookie } from '../session.js';

export interface AuthRoutesOptions {
    secureCookie: boolean;
    maxAttempts: number;
    windowMs: number;
    // Password reset is its own budget: a burst of reset attempts must not lock
    // a legitimate visitor out of sign-in.
    resetMaxAttempts: number;
    resetWindowMs: number;
    // A second budget on the request endpoint, keyed on the target address
    // rather than the caller, so one address cannot be flooded with links from
    // many origins.
    resetRequestsPerEmail: number;
    resetEmailWindowMs: number;
}

// A caller only ever learns about itself, and only these two fields.
function toAccountDto(account: Account): AccountDto {
    return { id: account.id, email: account.email };
}

function emailKey(body: unknown): string {
    // Runs on the rate limiter's path, before any validation, so it must
    // tolerate anything. Express 5 leaves the body undefined when the request
    // carries no JSON content type: reading a property off it would throw and
    // turn a malformed request into a 500 with an "unhandled failure" line,
    // where the boundary owes a 400. Guarding here rather than at the call site
    // covers every future caller too.
    const email =
        typeof body === 'object' && body !== null ? (body as { email?: unknown }).email : undefined;
    return normalizeEmailAddress(typeof email === 'string' ? email : '');
}

function forgotPasswordHandler(useCases: AuthUseCases): RequestHandler {
    return (req, res, next) => {
        const body = RequestPasswordResetBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .requestPasswordReset(body.data.email)
            // 202, no body: the request was accepted. Whether an email goes out
            // is not disclosed, so a registered and an unregistered address get
            // the exact same answer.
            .then(() => res.status(202).end())
            .catch(next);
    };
}

function resetPasswordHandler(useCases: AuthUseCases): RequestHandler {
    return (req, res, next) => {
        const body = ResetPasswordBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .resetPassword(body.data.token, body.data.password)
            // 204, no session cookie: a reset does not sign anyone in, and every
            // session of the account was just revoked.
            .then(() => res.status(204).end())
            .catch(next);
    };
}

// No requireAccount: the two acceptance-criteria responses -- a valid session
// signed out, and no session to begin with -- have to be the same response,
// not a 401 on one side and a 204 on the other. The cookie is cleared before
// the provider is ever asked, so the browser has already lost it even if that
// call fails; a real failure still reaches the error middleware; only the
// difference between "had a session" and "did not" is deliberately hidden.
function logoutHandler(useCases: AuthUseCases, secureCookie: boolean): RequestHandler {
    return (req, res, next) => {
        const token = readCookie(req.headers.cookie, SESSION_COOKIE);
        clearSessionCookie(res, secureCookie);

        useCases
            .signOut(token)
            .then(() => res.status(204).end())
            .catch(next);
    };
}

export function authRouter(useCases: AuthUseCases, options: AuthRoutesOptions): Router {
    const router = Router();
    // One budget for both endpoints. Guessing passwords and probing which
    // addresses exist are the same attack from the same client; two counters
    // would let it run twice as long.
    const limit = rateLimit({ maxAttempts: options.maxAttempts, windowMs: options.windowMs });
    const resetLimit = rateLimit({
        maxAttempts: options.resetMaxAttempts,
        windowMs: options.resetWindowMs,
    });
    const resetPerEmail = rateLimit({
        maxAttempts: options.resetRequestsPerEmail,
        windowMs: options.resetEmailWindowMs,
        key: req => emailKey(req.body),
    });

    const register: RequestHandler = (req, res, next) => {
        const body = RegisterAccountBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .registerAccount(body.data.email, body.data.password)
            // 201, no body, no session, whether the address was free or already
            // taken. A different status, a different shape or an automatic
            // login would each answer the question "does this address have an
            // account here".
            .then(() => res.status(201).end())
            .catch(next);
    };

    const login: RequestHandler = (req, res, next) => {
        const body = SignInBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .signIn(body.data.email, body.data.password)
            .then(session => {
                setSessionCookie(res, session, options.secureCookie);
                res.send(toAccountDto(session.account));
            })
            .catch(next);
    };

    const me: RequestHandler = (_req, res) => {
        res.send(toAccountDto(accountOf(res)));
    };

    router.post('/auth/register', limit, register);
    router.post('/auth/login', limit, login);
    router.get('/auth/me', requireAccount(useCases), me);
    router.post('/auth/password/forgot', resetLimit, resetPerEmail, forgotPasswordHandler(useCases));
    router.post('/auth/password/reset', resetLimit, resetPasswordHandler(useCases));
    router.post('/auth/logout', logoutHandler(useCases, options.secureCookie));

    return router;
}
