import { PASSWORD_POLICY } from '@legacy/contracts';

import { labels } from '../labels';
import { AuthField } from './auth-field';
import { useAuthForm } from '../hooks/use-auth-form';
import type { AuthMode } from '../hooks/use-auth-form';
import type { SubmitResult } from '../hooks/use-session';

export type { AuthMode } from '../hooks/use-auth-form';

export interface AuthFormProps {
    mode: AuthMode;
    isSubmitting: boolean;
    onSubmit: (email: string, password: string) => Promise<SubmitResult>;
}

function submitLabel(isRegister: boolean, isSubmitting: boolean): string {
    if (isRegister) return isSubmitting ? labels.registering : labels.register;
    return isSubmitting ? labels.signingIn : labels.signIn;
}

function Outcome({ outcome }: { outcome: SubmitResult | null }) {
    if (outcome === null) return null;

    if (outcome.status === 'error') {
        return (
            <p className="form-error" role="alert">
                {outcome.message}
            </p>
        );
    }

    // role="status" rather than "alert": a success is announced without
    // interrupting what the reader is doing.
    return outcome.message === undefined ? null : (
        <p className="form-success" role="status">
            {outcome.message}
        </p>
    );
}

export function AuthForm({ mode, isSubmitting, onSubmit }: AuthFormProps) {
    const form = useAuthForm(mode, onSubmit);
    const { isRegister, prefix } = form;

    return (
        <form className="auth-form" onSubmit={form.handleSubmit} noValidate>
            <AuthField
                id={`${prefix}-email`}
                label={labels.emailLabel}
                type="email"
                autoComplete={isRegister ? 'email' : 'username'}
                value={form.email}
                onChange={form.setEmail}
                error={form.errors.email}
                errorId={`${prefix}-email-error`}
                disabled={isSubmitting}
            />

            <AuthField
                id={`${prefix}-password`}
                label={labels.passwordLabel}
                type="password"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={form.setPassword}
                help={
                    isRegister
                        ? { id: `${prefix}-password-help`, text: labels.passwordPolicy(PASSWORD_POLICY) }
                        : undefined
                }
                error={form.errors.password}
                errorId={`${prefix}-password-error`}
                disabled={isSubmitting}
            />

            <button className="button button-primary" type="submit" disabled={isSubmitting}>
                {submitLabel(isRegister, isSubmitting)}
            </button>

            <Outcome outcome={form.outcome} />
        </form>
    );
}
