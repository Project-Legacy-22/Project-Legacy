import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import { labels } from '../labels';
import { AuthField } from './auth-field';
import { FormOutcome } from './form-outcome';
import type { SubmitResult } from '../hooks/use-session';

export interface RequestResetFormProps {
    isSubmitting: boolean;
    onSubmit: (email: string) => Promise<SubmitResult>;
    onBack: () => void;
}

// The email-only step of a password reset. A dedicated form rather than a mode
// of AuthForm: that one is built around a password field this step does not
// have, and bending it would be more code than a small form of its own.
export function RequestResetForm({ isSubmitting, onSubmit, onBack }: RequestResetFormProps) {
    const prefix = useId();
    const [email, setEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [outcome, setOutcome] = useState<SubmitResult | null>(null);

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();
        setOutcome(null);

        if (email.trim() === '') {
            setError(labels.emailRequired);
            return;
        }
        setError(null);
        void onSubmit(email.trim()).then(setOutcome);
    }

    return (
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthField
                id={`${prefix}-email`}
                label={labels.emailLabel}
                type="email"
                autoComplete="username"
                value={email}
                onChange={setEmail}
                error={error}
                errorId={`${prefix}-email-error`}
                disabled={isSubmitting}
            />
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? labels.requestingReset : labels.requestReset}
            </button>
            <FormOutcome outcome={outcome} />
            <button
                type="button"
                className="button button-quiet"
                onClick={onBack}
                disabled={isSubmitting}
            >
                {labels.backToSignIn}
            </button>
        </form>
    );
}
