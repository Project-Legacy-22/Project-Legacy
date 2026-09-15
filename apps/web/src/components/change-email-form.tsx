import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import { labels } from '../labels';
import { useFormSubmit } from '../hooks/use-form-submit';
import type { SubmitResult } from '../hooks/use-session';
import { AuthField } from './auth-field';
import { FormOutcome } from './form-outcome';

export interface ChangeEmailFormProps {
    isSubmitting: boolean;
    onSubmit: (newEmail: string) => Promise<SubmitResult>;
}

// Only "looks like an address": the server owns the real rule, and rejecting a
// well-formed address here that simply belongs to someone else would leak the
// same thing the endpoint refuses to.
function localError(newEmail: string): string | null {
    const trimmed = newEmail.trim();
    if (trimmed === '') return labels.emailRequired;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) return labels.emailInvalid;
    return null;
}

export function ChangeEmailForm({ isSubmitting, onSubmit }: ChangeEmailFormProps) {
    const prefix = useId();
    const [newEmail, setNewEmail] = useState('');
    const [error, setError] = useState<string | null>(null);
    const { outcome, run } = useFormSubmit(() => setNewEmail(''));

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();

        const found = localError(newEmail);
        setError(found);
        if (found === null) run(() => onSubmit(newEmail.trim()));
    }

    return (
        <form className="credentials-form" onSubmit={handleSubmit} noValidate>
            <h3 id="change-email-heading">{labels.changeEmailTitle}</h3>
            <p className="field-help">{labels.changeEmailIntro}</p>
            <AuthField
                id={`${prefix}-email`}
                label={labels.newEmailLabel}
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={setNewEmail}
                error={error}
                errorId={`${prefix}-email-error`}
                disabled={isSubmitting}
            />
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? labels.changingEmail : labels.changeEmailSubmit}
            </button>
            <FormOutcome outcome={outcome} />
        </form>
    );
}
