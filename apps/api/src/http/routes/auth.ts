import { RegisterAccountBody, SignInBody } from '@legacy/contracts';
import type { AccountDto } from '@legacy/contracts';
import type { Account } from '@legacy/core-auth';
import { Router } from 'express';
import type { RequestHandler } from 'express';

import type { AuthUseCases } from '../../composition-root.js';
import { rateLimit } from '../rate-limit.js';
import { accountOf, requireAccount, setSessionCookie } from '../session.js';

export interface AuthRoutesOptions {
    secureCookie: boolean;
    maxAttempts: number;
    windowMs: number;
}

// A caller only ever learns about itself, and only these two fields.
function toAccountDto(account: Account): AccountDto {
    return { id: account.id, email: account.email };
}

export function authRouter(useCases: AuthUseCases, options: AuthRoutesOptions): Router {
    const router = Router();
    // One budget for both endpoints. Guessing passwords and probing which
    // addresses exist are the same attack from the same client; two counters
    // would let it run twice as long.
    const limit = rateLimit({ maxAttempts: options.maxAttempts, windowMs: options.windowMs });

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

    return router;
}
