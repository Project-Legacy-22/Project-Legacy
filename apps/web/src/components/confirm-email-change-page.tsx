import { useState } from 'react';

import { labels } from '../labels';
import type { SubmitResult } from '../hooks/use-session';

export interface ConfirmEmailChangePageProps {
    token: string;
    isSubmitting: boolean;
    onConfirm: (token: string) => Promise<SubmitResult>;
}

// A full screen, like the reset-password page: it is reached by opening a link,
// not by a button, and a signed-in visitor who follows it still needs to land
// here. Confirmation is an explicit click rather than a call on mount, so a
// double render cannot spend the single-use token twice and then report the
// second failure.
export function ConfirmEmailChangePage({ token, isSubmitting, onConfirm }: ConfirmEmailChangePageProps) {
    const [outcome, setOutcome] = useState<SubmitResult | null>(null);
    const done = outcome?.status === 'success';

    function confirm(): void {
        setOutcome(null);
        void onConfirm(token).then(setOutcome);
    }

    return (
        <main className="auth-page" id="main-content">
            <h1>{labels.confirmEmailChangeTitle}</h1>
            <p className="auth-intro">{labels.confirmEmailChangeIntro}</p>

            {done ? (
                <>
                    <p className="form-success" role="status">
                        {labels.confirmEmailChangeSucceeded}
                    </p>
                    <a className="button button-primary" href="/">
                        {labels.backToSignIn}
                    </a>
                </>
            ) : (
                <>
                    <button
                        className="button button-primary"
                        type="button"
                        onClick={confirm}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? labels.confirmingEmailChange : labels.confirmEmailChangeSubmit}
                    </button>
                    {outcome?.status === 'error' && (
                        <p className="form-error" role="alert">
                            {outcome.message}
                        </p>
                    )}
                </>
            )}
        </main>
    );
}
