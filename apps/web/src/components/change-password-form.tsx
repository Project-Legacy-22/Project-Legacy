import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import { PASSWORD_POLICY } from '@legacy/contracts';

import { labels } from '../labels';
import { useFormSubmit } from '../hooks/use-form-submit';
import type { SubmitResult } from '../hooks/use-session';
import { AuthField } from './auth-field';
import { FormOutcome } from './form-outcome';

export interface ChangePasswordFormProps {
    isSubmitting: boolean;
    onSubmit: (currentPassword: string, newPassword: string) => Promise<SubmitResult>;
}

interface FieldErrors {
    current: string | null;
    next: string | null;
}

const NO_ERRORS: FieldErrors = { current: null, next: null };

// A subset of what the server enforces, and deliberately so: the server stays
// the authority on the full policy and on whether the current password is
// right. This only spares a round trip for the two mistakes a person makes
// most, and puts the refusal on the field.
function validate(currentPassword: string, newPassword: string): FieldErrors {
    return {
        current: currentPassword === '' ? labels.currentPasswordRequired : null,
        next:
            newPassword.length < PASSWORD_POLICY.minimumLength
                ? labels.passwordTooShort(PASSWORD_POLICY.minimumLength)
                : null,
    };
}

export function ChangePasswordForm({ isSubmitting, onSubmit }: ChangePasswordFormProps) {
    const prefix = useId();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
    const { outcome, run } = useFormSubmit(() => {
        setCurrentPassword('');
        setNewPassword('');
    });

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();

        const found = validate(currentPassword, newPassword);
        setErrors(found);
        if (found.current === null && found.next === null) {
            run(() => onSubmit(currentPassword, newPassword));
        }
    }

    return (
        <form className="credentials-form" onSubmit={handleSubmit} noValidate>
            <h3 id="change-password-heading">{labels.changePasswordTitle}</h3>
            <AuthField
                id={`${prefix}-current`}
                label={labels.currentPasswordLabel}
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                error={errors.current}
                errorId={`${prefix}-current-error`}
                disabled={isSubmitting}
            />
            <AuthField
                id={`${prefix}-new`}
                label={labels.newPasswordLabel}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={setNewPassword}
                help={{ id: `${prefix}-new-help`, text: labels.passwordPolicy(PASSWORD_POLICY) }}
                error={errors.next}
                errorId={`${prefix}-new-error`}
                disabled={isSubmitting}
            />
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? labels.changingPassword : labels.changePasswordSubmit}
            </button>
            <FormOutcome outcome={outcome} />
        </form>
    );
}
