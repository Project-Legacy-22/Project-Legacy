import { useEffect, useRef } from 'react';

import type { useCredentials } from '../hooks/use-credentials';
import type { useSession } from '../hooks/use-session';
import { ConfirmEmailChangePage } from './confirm-email-change-page';
import { ResetPasswordPage } from './reset-password-page';

// The recovery and email-change emails link back with the token hash as a query
// parameter. It is read once, on the first render, and then wiped from the
// address bar so it stops sitting in history or leaking through a Referer on
// the next navigation.
function readDeepLinkToken(type: 'recovery' | 'email_change'): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('type') === type ? params.get('token_hash') : null;
}

export function useDeepLinkToken(type: 'recovery' | 'email_change'): string | null {
    const token = useRef(readDeepLinkToken(type));

    useEffect(() => {
        if (token.current !== null) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    return token.current;
}

export interface DeepLinkPagesProps {
    recoveryToken: string | null;
    emailChangeToken: string | null;
    session: ReturnType<typeof useSession>;
    credentials: ReturnType<typeof useCredentials>;
}

// A recovery or email-change link wins over everything else, including a live
// session: the person following it came to finish that flow, not to see their
// items, and the link may be opened in a browser that never held a session.
// Returns null when the address bar carries neither token.
export function DeepLinkPages({
    recoveryToken,
    emailChangeToken,
    session,
    credentials,
}: DeepLinkPagesProps) {
    if (recoveryToken !== null) {
        return (
            <ResetPasswordPage
                token={recoveryToken}
                isSubmitting={session.isSubmitting}
                onSubmit={session.resetPassword}
            />
        );
    }
    if (emailChangeToken !== null) {
        return (
            <ConfirmEmailChangePage
                token={emailChangeToken}
                isSubmitting={credentials.isSubmitting}
                onConfirm={credentials.confirmEmailChange}
            />
        );
    }
    return null;
}
