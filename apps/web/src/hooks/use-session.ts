import { useCallback, useEffect, useState } from 'react';

import { PRIVACY_POLICY_VERSION } from '@legacy/contracts';
import type { Dispatch, SetStateAction } from 'react';

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

// The shape every non-sign-in action shares: call the API, report a fixed
// success line, or the server's reason on failure. sign-in is the exception,
// because it also has an account to store.
async function attempt(
    call: () => Promise<unknown>,
    success: string,
    fallback: string,
): Promise<SubmitResult> {
    try {
        await call();
        return { status: 'success', message: success };
    } catch (error) {
        return { status: 'error', message: messageOf(error, fallback) };
    }
}

// Asked once on mount. The cookie is httpOnly, so the page cannot read it: the
// only way to know whether a session is valid is to ask the API.
function useSessionCheck(api: AuthApi): [SessionState, Dispatch<SetStateAction<SessionState>>] {
    const [state, setState] = useState<SessionState>({ status: 'checking' });

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

    return [state, setState];
}

// Split out of useSessionActions to keep that hook under the project's
// line-per-function ceiling, like useSignOut below it.
function useSignIn(
    api: AuthApi,
    guarded: (action: () => Promise<SubmitResult>) => Promise<SubmitResult>,
    setState: Dispatch<SetStateAction<SessionState>>,
) {
    return useCallback(
        (email: string, password: string): Promise<SubmitResult> =>
            guarded(async () => {
                try {
                    setState({ status: 'signedIn', account: await api.signIn({ email, password }) });
                    return { status: 'success' };
                } catch (error) {
                    return { status: 'error', message: messageOf(error, labels.signInRejected) };
                }
            }),
        [api, guarded, setState],
    );
}

// Split out of useSessionActions to keep that hook under the project's
// line-per-function ceiling.
//
// Always ends signed out, whether or not the call to the API itself
// succeeded: the cookie is cleared server-side regardless (auth-api.ts), and
// there is nothing left to retry that the shared-computer scenario this
// exists for should wait on.
function useSignOut(
    api: AuthApi,
    guarded: (action: () => Promise<SubmitResult>) => Promise<SubmitResult>,
    setState: Dispatch<SetStateAction<SessionState>>,
) {
    return useCallback(
        (): Promise<SubmitResult> =>
            guarded(async () => {
                try {
                    await api.signOut();
                } catch {
                    // Swallowed on purpose: see the comment above this hook.
                    // A rejection here must not become an unhandled one at
                    // the button's onClick, which does not await this call.
                } finally {
                    setState({ status: 'anonymous' });
                }
                return { status: 'success' };
            }),
        [api, guarded, setState],
    );
}

// The version is read from the contract rather than passed by the form: the box
// the reader ticked and the version recorded must be the same one, and a prop
// would let them drift.
function registerWithConsent(api: AuthApi, email: string, password: string): Promise<void> {
    return api.register({
        email,
        password,
        acceptsPrivacyPolicy: true,
        policyVersion: PRIVACY_POLICY_VERSION,
    });
}

function useSessionActions(api: AuthApi, setState: Dispatch<SetStateAction<SessionState>>) {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const guarded = useCallback(
        async (action: () => Promise<SubmitResult>): Promise<SubmitResult> => {
            setIsSubmitting(true);
            try {
                return await action();
            } finally {
                setIsSubmitting(false);
            }
        },
        [],
    );

    const signIn = useSignIn(api, guarded, setState);
    const signOut = useSignOut(api, guarded, setState);

    const run = useCallback(
        (call: () => Promise<unknown>, success: string, fallback: string): Promise<SubmitResult> =>
            guarded(() => attempt(call, success, fallback)),
        [guarded],
    );

    return {
        isSubmitting,
        signIn,
        signOut,
        // The version is read from the contract rather than passed by the form:
        // the box the reader ticked and the version recorded must be the same
        // one, and going through a prop would let them drift.
        register: (email: string, password: string) =>
            run(() => registerWithConsent(api, email, password), labels.registerAccepted, labels.registerFailed),
        requestPasswordReset: (email: string) =>
            run(
                () => api.requestPasswordReset({ email }),
                labels.resetRequestAccepted,
                labels.resetRequestFailed,
            ),
        resetPassword: (token: string, password: string) =>
            run(
                () => api.resetPassword({ token, password }),
                labels.resetPasswordSucceeded,
                labels.resetPasswordFailed,
            ),
    };
}

export function useSession(api: AuthApi) {
    const [state, setState] = useSessionCheck(api);

    // The account behind this session no longer exists. Erasure (US-13) is the
    // only caller today; a real sign-out is US-27 and will need the API to drop
    // the cookie as well, which this does not do. It sits here rather than in
    // useSessionActions: it submits nothing and has no failure to report.
    const forget = useCallback(() => {
        setState({ status: 'anonymous' });
    }, [setState]);

    return { state, forget, ...useSessionActions(api, setState) };
}
