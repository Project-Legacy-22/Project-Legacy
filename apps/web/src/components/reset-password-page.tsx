import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import { PASSWORD_POLICY } from '@legacy/contracts';

import { labels } from '../labels';
import { AuthField } from './auth-field';
import { FormOutcome } from './form-outcome';
import type { SubmitResult } from '../hooks/use-session';

export interface ResetPasswordPageProps {
    token: string;
    isSubmitting: boolean;
    onSubmit: (token: string, password: string) => Promise<SubmitResult>;
}

function localError(password: string): string | null {
    if (password === '') return labels.passwordRequired;
    if (password.length < PASSWORD_POLICY.minimumLength) {
        return labels.passwordTooShort(PASSWORD_POLICY.minimumLength);
    }
    return null;
}

function NewPasswordForm({ isSubmitting, onSubmit }: { isSubmitting: boolean; onSubmit: (password: string) => Promise<SubmitResult> }) {
    const prefix = useId();
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [outcome, setOutcome] = useState<SubmitResult | null>(null);

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        setOutcome(null);

        const found = localError(password);
        setError(found);
        if (found !== null) return;
        void onSubmit(password).then(setOutcome);
    }

    return (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthField
                id={`${prefix}-password`}
                label={labels.newPasswordLabel}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
                help={{ id: `${prefix}-password-help`, text: labels.passwordPolicy(PASSWORD_POLICY) }}
                error={error}
                errorId={`${prefix}-password-error`}
                disabled={isSubmitting}
            />
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? labels.resettingPassword : labels.resetPassword}
            </button>
            <FormOutcome outcome={outcome} />
            {outcome?.status === 'error' && (
                <a className="button button-quiet" href="/">
                    {labels.requestNewResetLink}
                </a>
            )}
        </form>
    );
}

// A full screen rather than a mode of the auth page: it is reached by opening a
// link, not by a button, and a signed-in visitor who follows that link still
// needs to land here. The links out are full page loads, which also drop any
// now-revoked cookie this browser still holds.
export function ResetPasswordPage({ token, isSubmitting, onSubmit }: ResetPasswordPageProps) {
    const [done, setDone] = useState(false);

    async function submit(password: string): Promise<SubmitResult> {
        const result = await onSubmit(token, password);
        if (result.status === 'success') setDone(true);
        return result;
    }

    return (
        <main className="auth-page" id="main-content">
            <h1>{labels.resetPasswordTitle}</h1>
            <p className="auth-intro">{labels.resetPasswordIntro}</p>

            {done ? (
                <>
                    <p className="form-success" role="status">
                        {labels.resetPasswordSucceeded}
                    </p>
                    <a className="button button-primary" href="/">
                        {labels.backToSignIn}
                    </a>
                </>
            ) : (
                <NewPasswordForm isSubmitting={isSubmitting} onSubmit={submit} />
            )}
        </main>
    );
}
