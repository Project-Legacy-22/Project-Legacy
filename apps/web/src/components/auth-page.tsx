import { useState } from 'react';

import { labels } from '../labels';
import { AuthForm } from './auth-form';
import type { AuthMode } from './auth-form';
import type { SubmitResult } from '../hooks/use-session';

export interface AuthPageProps {
    isSubmitting: boolean;
    onSignIn: (email: string, password: string) => Promise<SubmitResult>;
    onRegister: (email: string, password: string) => Promise<SubmitResult>;
}

export function AuthPage({ isSubmitting, onSignIn, onRegister }: AuthPageProps) {
    const [mode, setMode] = useState<AuthMode>('signIn');
    const isRegister = mode === 'register';

    return (
        <main className="auth-page" id="main-content">
            <h1>{isRegister ? labels.registerTitle : labels.signInTitle}</h1>
            <p className="auth-intro">{isRegister ? labels.registerIntro : labels.signInIntro}</p>

            {/* The form is remounted when the mode changes, so the fields and
                the messages of the previous mode do not linger behind a title
                that no longer describes them. */}
            <AuthForm
                key={mode}
                mode={mode}
                isSubmitting={isSubmitting}
                onSubmit={isRegister ? onRegister : onSignIn}
            />

            {/* A button, not a link: it changes what is on screen, it does not
                navigate. A link would promise an address that does not exist. */}
            <button
                type="button"
                className="button button-quiet"
                onClick={() => setMode(isRegister ? 'signIn' : 'register')}
                disabled={isSubmitting}
            >
                {isRegister ? labels.switchToSignIn : labels.switchToRegister}
            </button>
        </main>
    );
}
