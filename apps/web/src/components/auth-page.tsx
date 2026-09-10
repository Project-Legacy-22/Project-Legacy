import { useState } from 'react';

import { labels } from '../labels';
import { AuthForm } from './auth-form';
import type { AuthMode } from './auth-form';
import { RequestResetForm } from './request-reset-form';
import type { SubmitResult } from '../hooks/use-session';

export interface AuthPageProps {
    onOpenPolicy: () => void;
    isSubmitting: boolean;
    onSignIn: (email: string, password: string) => Promise<SubmitResult>;
    onRegister: (email: string, password: string) => Promise<SubmitResult>;
    onRequestReset: (email: string) => Promise<SubmitResult>;
}

type Screen = AuthMode | 'requestReset';

function title(screen: Screen): string {
    if (screen === 'register') return labels.registerTitle;
    if (screen === 'requestReset') return labels.requestResetTitle;
    return labels.signInTitle;
}

function intro(screen: Screen): string {
    if (screen === 'register') return labels.registerIntro;
    if (screen === 'requestReset') return labels.requestResetIntro;
    return labels.signInIntro;
}

export function AuthPage({ isSubmitting, onSignIn, onRegister, onRequestReset, onOpenPolicy }: AuthPageProps) {
    const [screen, setScreen] = useState<Screen>('signIn');

    return (
        <main className="auth-page" id="main-content">
            <h1>{title(screen)}</h1>
            <p className="auth-intro">{intro(screen)}</p>

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
                        onOpenPolicy={onOpenPolicy}
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
