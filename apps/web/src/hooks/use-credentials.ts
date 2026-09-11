import { useCallback, useState } from 'react';

import { ApiError } from '../api/items-api';
import type { CredentialsApi } from '../api/credentials-api';
import { labels } from '../labels';
import type { SubmitResult } from './use-session';

function messageOf(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

// The signed-in half of US-36: the two forms of the account section. The
// confirmation screen has its own page and does not go through here.
//
// changeEmail reports "check your inbox", not "your address changed": nothing
// changes until the emailed link is followed, and the session's account keeps
// the old address until then.
export function useCredentials(api: CredentialsApi) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const run = useCallback(
        async (
            call: () => Promise<void>,
            success: string,
            fallback: string,
        ): Promise<SubmitResult> => {
            setIsSubmitting(true);
            try {
                await call();
                return { status: 'success', message: success };
            } catch (error) {
                return { status: 'error', message: messageOf(error, fallback) };
            } finally {
                setIsSubmitting(false);
            }
        },
        [],
    );

    return {
        isSubmitting,
        changePassword: (currentPassword: string, newPassword: string): Promise<SubmitResult> =>
            run(
                () => api.changePassword({ currentPassword, newPassword }),
                labels.passwordChanged,
                labels.changePasswordFailed,
            ),
        changeEmail: (newEmail: string): Promise<SubmitResult> =>
            run(
                () => api.changeEmail({ newEmail }),
                labels.emailChangeRequested,
                labels.emailChangeFailed,
            ),
        // Driven by the confirmation page, which is reached from an emailed
        // link and may open in a browser with no session at all.
        confirmEmailChange: (token: string): Promise<SubmitResult> =>
            run(
                () => api.confirmEmailChange({ token }),
                labels.confirmEmailChangeSucceeded,
                labels.confirmEmailChangeFailed,
            ),
    };
}
