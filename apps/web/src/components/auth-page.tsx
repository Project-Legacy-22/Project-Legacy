import { useState } from 'react';

import { labels } from '../labels';
import { AuthForm } from './auth-form';
import { AuthHeading } from './auth-heading';
import type { Screen } from './auth-heading';
import { RequestResetForm } from './request-reset-form';
import type { SubmitResult } from '../hooks/use-session';

export interface AuthPageProps {
    // Why this screen is showing again, when there is a reason: a session that
    // ended while the page was in use (US-27). Undefined rather than optional,
    // because exactOptionalPropertyTypes makes the two different and the caller
    // always has an answer, even when that answer is "no reason".
    notice: string | undefined;
    isSubmitting: boolean;
    onSignIn: (email: string, password: string) => Promise<SubmitResult>;
    onRegister: (email: string, password: string) => Promise<SubmitResult>;
    onRequestReset: (email: string) => Promise<SubmitResult>;
}

export function AuthPage(props: AuthPageProps) {
    const { notice, isSubmitting, onSignIn, onRegister, onRequestReset } = props;
    const [screen, setScreen] = useState<Screen>('signIn');

    return (
        <main className="auth-page" id="main-content">
            <AuthHeading screen={screen} notice={notice} />

            {screen === 'requestReset' ? (
                <RequestResetForm
                    isSubmitting={isSubmitting}
                    onSubmit={onRequestReset}
                    onBack={() => setScreen('signIn')}
                />
            ) : (
                <>
                    {/* Remounted when the mode changes, so the fields and
                        messages of the previous mode do not linger behind a
                        title that no longer describes them. */}
                    <AuthForm
                        key={screen}
                        mode={screen}
                        isSubmitting={isSubmitting}
                        onSubmit={screen === 'register' ? onRegister : onSignIn}
                    />

                    {/* Buttons, not links: they change what is on screen, they
                        do not navigate to an address that does not exist. */}
                    <button
                        type="button"
                        className="button button-quiet"
                        onClick={() => setScreen(screen === 'register' ? 'signIn' : 'register')}
                        disabled={isSubmitting}
                    >
                        {screen === 'register' ? labels.switchToSignIn : labels.switchToRegister}
                    </button>

                    {screen === 'signIn' && (
                        <button
                            type="button"
                            className="button button-quiet"
                            onClick={() => setScreen('requestReset')}
                            disabled={isSubmitting}
                        >
                            {labels.forgotPasswordLink}
                        </button>
                    )}
                </>
            )}
        </main>
    );
}
