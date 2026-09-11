import { ChangeEmailBody, ChangePasswordBody, ConfirmEmailChangeBody } from '@legacy/contracts';
import { normalizeEmailAddress } from '@legacy/core-auth';
import type { AuthenticatedCaller } from '@legacy/core-auth';
import { Router } from 'express';
import type { RequestHandler, Response } from 'express';

import type { AuthUseCases } from '../../composition-root.js';
import { rateLimit } from '../rate-limit.js';
import { accountOf, requireAccount, sessionTokensOf } from '../session.js';

export interface CredentialsRoutesOptions {
    secureCookie: boolean;
    // Per-caller budget shared by the password change and the confirmation
    // endpoint: guessing a current password and replaying a confirmation link
    // are the same kind of abuse from the same client.
    maxAttempts: number;
    windowMs: number;
    // A second budget on the email-change endpoint, keyed on the target
    // address rather than the caller, so one inbox cannot be flooded with
    // confirmation mail. GoTrue's own email throttle is a further ceiling.
    emailChangesPerAddress: number;
    emailChangeWindowMs: number;
}

// What the provider needs to act as the caller rather than as an administrator.
// requireAccount put the account and the current session tokens on res.locals;
// reading the tokens off the request instead would hand a stale pair to any
// route that runs just after a renewal.
function callerOf(res: Response): AuthenticatedCaller {
    return { account: accountOf(res), ...sessionTokensOf(res) };
}

// Runs on the rate limiter's path, before validation, so it tolerates anything:
// a request with no JSON body leaves req.body undefined (Express), and reading
// a property off it would turn a 400 into a 500.
function targetAddressKey(body: unknown): string {
    const value =
        typeof body === 'object' && body !== null
            ? (body as { newEmail?: unknown }).newEmail
            : undefined;
    return normalizeEmailAddress(typeof value === 'string' ? value : '');
}

function changePasswordHandler(useCases: AuthUseCases): RequestHandler {
    return (req, res, next) => {
        const body = ChangePasswordBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .changePassword(callerOf(res), body.data.currentPassword, body.data.newPassword)
            // 204, no body, no Set-Cookie: the current session is kept as it is,
            // and every other session of the account was just revoked.
            .then(() => res.status(204).end())
            .catch(next);
    };
}

function changeEmailHandler(useCases: AuthUseCases): RequestHandler {
    return (req, res, next) => {
        const body = ChangeEmailBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .changeEmail(callerOf(res), body.data.newEmail)
            // 202, empty body, identical whether the address is free or already
            // registered: the form is not an account-existence oracle. The
            // address of record does not change until the emailed link is
            // followed.
            .then(() => res.status(202).end())
            .catch(next);
    };
}

// No requireAccount: the confirmation link is opened from an email client, which
// may land in a browser that never held a session. The token is the
// authorization, and it travels in the body, never the URL.
function confirmEmailChangeHandler(useCases: AuthUseCases): RequestHandler {
    return (req, res, next) => {
        const body = ConfirmEmailChangeBody.safeParse(req.body);
        if (!body.success) return next(body.error);

        useCases
            .confirmEmailChange(body.data.token)
            .then(() => res.status(204).end())
            .catch(next);
    };
}

// Changing one's own email address or password while signed in (US-36). Like
// accountRouter it carries its own requireAccount: the two authenticated routes
// act on the caller's own account and take no identifier from the request.
export function credentialsRouter(useCases: AuthUseCases, options: CredentialsRoutesOptions): Router {
    const router = Router();
    const session = requireAccount(useCases, options.secureCookie);
    const limit = rateLimit({ maxAttempts: options.maxAttempts, windowMs: options.windowMs });
    const perAddress = rateLimit({
        maxAttempts: options.emailChangesPerAddress,
        windowMs: options.emailChangeWindowMs,
        key: req => targetAddressKey(req.body),
    });

    router.put('/auth/me/password', limit, session, changePasswordHandler(useCases));
    router.put('/auth/me/email', limit, perAddress, session, changeEmailHandler(useCases));
    router.post('/auth/me/email/confirm', limit, confirmEmailChangeHandler(useCases));

    return router;
}
