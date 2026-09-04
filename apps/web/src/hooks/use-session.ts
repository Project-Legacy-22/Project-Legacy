import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/items-api';
import type { AccountDto, AuthApi } from '../api/auth-api';
import { labels } from '../labels';

// Arriving with no session is the ordinary first visit, not an error: the state
// distinguishes "not checked yet" from "checked, nobody signed in", so the app
// never flashes the sign-in screen at someone who is in fact signed in.
export type SessionState =
    | { status: 'checking' }
    | { status: 'anonymous' }
    | { status: 'signedIn'; account: AccountDto }
    | { status: 'error'; message: string };

export type SubmitResult = { status: 'success'; message?: string } | { status: 'error'; message: string };

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

function messageOf(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

export function useSession(api: AuthApi) {
    const [state, setState] = useState<SessionState>({ status: 'checking' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Asked once on mount. The cookie is httpOnly, so the page cannot read it:
    // the only way to know whether a session is valid is to ask the API.
    useEffect(() => {
        const controller = new AbortController();

        api.currentAccount(controller.signal)
            .then(account => {
                if (controller.signal.aborted) return;
                setState(account === null ? { status: 'anonymous' } : { status: 'signedIn', account });
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted || isAbortError(error)) return;
                setState({ status: 'error', message: messageOf(error, labels.sessionCheckFailed) });
            });

        return () => controller.abort();
    }, [api]);

    const signIn = useCallback(
        async (email: string, password: string): Promise<SubmitResult> => {
            setIsSubmitting(true);
            try {
                const account = await api.signIn({ email, password });
                setState({ status: 'signedIn', account });
                return { status: 'success' };
            } catch (error) {
                return { status: 'error', message: messageOf(error, labels.signInRejected) };
            } finally {
                setIsSubmitting(false);
            }
        },
        [api],
    );

    const register = useCallback(
        async (email: string, password: string): Promise<SubmitResult> => {
            setIsSubmitting(true);
            try {
                await api.register({ email, password });
                // No session and no account name in the confirmation: the API
                // answers the same way whether the address was free or taken.
                return { status: 'success', message: labels.registerAccepted };
            } catch (error) {
                return { status: 'error', message: messageOf(error, labels.registerFailed) };
            } finally {
                setIsSubmitting(false);
            }
        },
        [api],
    );

    return { state, isSubmitting, signIn, register };
}
