import type { ChangeEmailBody, ChangePasswordBody, ConfirmEmailChangeBody } from '@legacy/contracts';

import { labels } from '../labels';
import { send, statusMessage } from './failure';
import { ApiError, errorMessage, jsonHeaders } from './items-api';

// Changing one's own credentials while signed in (US-36). Like auth-api, no
// token passes through here: the session is the httpOnly cookie pair the
// browser sends on its own.
export interface CredentialsApi {
    changePassword: (body: ChangePasswordBody) => Promise<void>;
    // The new address only; the account is the session's. Resolves on 202
    // whether the address was free or already registered.
    changeEmail: (body: ChangeEmailBody) => Promise<void>;
    confirmEmailChange: (body: ConfirmEmailChangeBody) => Promise<void>;
}

export const credentialsApi: CredentialsApi = {
    async changePassword(body) {
        const response = await send('/auth/me/password', {
            method: 'PUT',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            // The server's detail is surfaced: "the current password is
            // incorrect", "must be at least 12 characters", "appeared in a
            // known breach" are all about what this person just typed.
            throw new ApiError(
                response.status,
                await errorMessage(response, labels.changePasswordFailed),
            );
        }
    },

    async changeEmail(body) {
        const response = await send('/auth/me/email', {
            method: 'PUT',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            // Never the server's detail: this form must not become a way to
            // tell which addresses already have an account. The status may
            // still say the service is throttled or down.
            throw new ApiError(response.status, await statusMessage(response, labels.emailChangeFailed));
        }
    },

    async confirmEmailChange(body) {
        const response = await send('/auth/me/email/confirm', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            // "This confirmation link is invalid or has expired" is exactly
            // what the person on the confirmation screen needs to read.
            throw new ApiError(
                response.status,
                await errorMessage(response, labels.confirmEmailChangeFailed),
            );
        }
    },
};
