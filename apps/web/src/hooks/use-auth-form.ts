import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import { PASSWORD_POLICY } from '@legacy/contracts';

import { labels } from '../labels';
import type { SubmitResult } from './use-session';

export type AuthMode = 'signIn' | 'register';

export interface FieldErrors {
    email: string | null;
    password: string | null;
    consent: string | null;
}

const NO_ERRORS: FieldErrors = { email: null, password: null, consent: null };

// Checked here as well as by the API, so an obviously doomed request is not
// sent and the reader is told what is wrong without a round trip. The server
// stays the authority on both rules.
function passwordError(mode: AuthMode, password: string): string | null {
    if (password === '') return labels.passwordRequired;
    if (mode === 'register' && password.length < PASSWORD_POLICY.minimumLength) {
        return labels.passwordTooShort(PASSWORD_POLICY.minimumLength);
    }
    return null;
}

interface Submitted {
    mode: AuthMode;
    email: string;
    password: string;
    consents: boolean;
}

function validate({ mode, email, password, consents }: Submitted): FieldErrors {
    return {
        email: email.trim() === '' ? labels.emailRequired : null,
        password: passwordError(mode, password),
        // Only registering asks for consent. Signing in must keep working for
        // an account created under an earlier version of the policy.
        consent: mode === 'register' && !consents ? labels.consentRequired : null,
    };
}

export function useAuthForm(
    mode: AuthMode,
    onSubmit: (email: string, password: string) => Promise<SubmitResult>,
) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    // Starts false, and nothing ever sets it on the reader's behalf: a
    // pre-ticked box is not consent, and US-37 makes that a criterion rather
    // than a preference.
    const [consents, setConsents] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
    const [outcome, setOutcome] = useState<SubmitResult | null>(null);

    // Generated rather than hard-coded, so mounting both forms in one document
    // could never make two elements share an id and silently break every label
    // and aria-describedby pointing at them.
    const prefix = useId();
    const isRegister = mode === 'register';

    function handleSubmit(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault();

        const found = validate({ mode, email, password, consents });
        setErrors(found);
        setOutcome(null);
        if (found.email !== null || found.password !== null || found.consent !== null) return;

        void onSubmit(email.trim(), password).then(result => {
            setOutcome(result);
            // A successful registration clears the password: the next step is
            // signing in, and a filled field invites a second submission.
            if (result.status === 'success' && isRegister) {
                setPassword('');
                // Cleared with the password: the next registration is a new
                // decision, not one inherited from the previous screen.
                setConsents(false);
            }
        });
    }

    return {
        email,
        password,
        consents,
        setConsents,
        errors,
        outcome,
        isRegister,
        prefix,
        setEmail,
        setPassword,
        handleSubmit,
    };
}
