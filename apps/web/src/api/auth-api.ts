import { AccountDto } from '@legacy/contracts';
import type {
    RegisterAccountBody,
    RequestPasswordResetBody,
    ResetPasswordBody,
    SignInBody,
} from '@legacy/contracts';

import { labels } from '../labels';
import { ApiError, failureMessage, send, statusMessage } from './failure';

export type { AccountDto } from '@legacy/contracts';

// The session never passes through this module. The API replies to a sign-in
// with an httpOnly cookie, which the browser stores and resends on its own;
// nothing here reads or keeps a token, because anything JavaScript can read,
// a script injected into the page can read too.
export interface AuthApi {
    register: (body: RegisterAccountBody) => Promise<void>;
    signIn: (body: SignInBody) => Promise<AccountDto>;
    // Resolves to null when there is no valid session, rather than throwing:
    // arriving without one is the ordinary case on first visit, not a failure.
    currentAccount: (signal: AbortSignal) => Promise<AccountDto | null>;
    // Asks for a reset link. The reset token and the new password only ever
    // travel in a request body, never a URL, so neither reaches a log or a
    // Referer header.
    requestPasswordReset: (body: RequestPasswordResetBody) => Promise<void>;
    resetPassword: (body: ResetPasswordBody) => Promise<void>;
    // The cookie is cleared server-side whether or not this call itself
    // succeeds (see apps/api/src/http/routes/auth.ts), which is why the hook
    // above it does not need a distinct failure path: by the time a response
    // exists, the browser has already lost the session either way.
    signOut: () => Promise<void>;
}

const jsonHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
};

export const authApi: AuthApi = {
    async register(body) {
        const response = await send('/auth/register', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new ApiError(
                response.status,
                await failureMessage(response, labels.registerFailed),
            );
        }
    },

    async signIn(body) {
        const response = await send('/auth/login', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        // A refusal and a failure are not the same answer, and they were being
        // shown as one. The server deliberately does not say which half of a
        // refusal was wrong, so 401 keeps a single message. Anything else has
        // nothing to withhold: showing the refusal on a 500 sent somebody to
        // check an address and a password that were both right, while GoTrue was
        // answering Gateway Timeout.
        if (response.status === 401) {
            throw new ApiError(401, labels.signInRejected);
        }

        if (!response.ok) {
            throw new ApiError(response.status, await failureMessage(response, labels.signInFailed));
        }

        try {
            return AccountDto.parse(await response.json());
        } catch {
            throw new ApiError(502, labels.unreadableResponse);
        }
    },

    async currentAccount(signal) {
        const response = await send('/auth/me', { headers: { Accept: 'application/json' }, signal });

        if (response.status === 401) return null;
        if (!response.ok) {
            throw new ApiError(response.status, await failureMessage(response, labels.sessionCheckFailed));
        }

        try {
            return AccountDto.parse(await response.json());
        } catch {
            throw new ApiError(502, labels.unreadableResponse);
        }
    },

    async requestPasswordReset(body) {
        const response = await send('/auth/password/forgot', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            // Never the server's detail: the request screen must not become a
            // way to tell which addresses exist. The status may still say that
            // the service is throttled or down, which discloses nothing.
            throw new ApiError(response.status, await statusMessage(response, labels.resetRequestFailed));
        }
    },

    async resetPassword(body) {
        const response = await send('/auth/password/reset', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            // The detail is surfaced here: "this link has expired" is exactly
            // what the person on the reset screen needs to read.
            throw new ApiError(
                response.status,
                await failureMessage(response, labels.resetPasswordFailed),
            );
        }
    },

    async signOut() {
        const response = await send('/auth/logout', { method: 'POST' });

        if (!response.ok) {
            throw new ApiError(response.status, labels.signOutFailed);
        }
    },
};
