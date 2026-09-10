import { useEffect, useRef, useState } from 'react';

import { labels } from '../labels';
import { AuthForm } from './auth-form';
import type { AuthMode } from './auth-form';
import { RequestResetForm } from './request-reset-form';
import type { SubmitResult } from '../hooks/use-session';

export interface AuthPageProps {
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

interface SignInOrRegisterProps {
    screen: AuthMode;
    isSubmitting: boolean;
    onSignIn: (email: string, password: string) => Promise<SubmitResult>;
    onRegister: (email: string, password: string) => Promise<SubmitResult>;
    onSwitch: (screen: AuthMode) => void;
    onForgotPassword: () => void;
}

function SignInOrRegister({
    screen,
    isSubmitting,
    onSignIn,
    onRegister,
    onSwitch,
    onForgotPassword,
}: SignInOrRegisterProps) {
    return (
        <>
            {/* Remounted when the mode changes, so the fields and messages of
                the previous mode do not linger behind a title that no longer
                describes them. */}
            <AuthForm
                key={screen}
                mode={screen}
                isSubmitting={isSubmitting}
                onSubmit={screen === 'register' ? onRegister : onSignIn}
            />

            {/* Buttons, not links: they change what is on screen, they do not
                navigate to an address that does not exist. */}
            <button
                type="button"
                className="button button-quiet"
                onClick={() => onSwitch(screen === 'register' ? 'signIn' : 'register')}
                disabled={isSubmitting}
            >
                {screen === 'register' ? labels.switchToSignIn : labels.switchToRegister}
            </button>

            {screen === 'signIn' && (
                <button
                    type="button"
                    className="button button-quiet"
                    onClick={onForgotPassword}
                    disabled={isSubmitting}
                >
                    {labels.forgotPasswordLink}
                </button>
            )}
        </>
    );
}

export function AuthPage({ isSubmitting, onSignIn, onRegister, onRequestReset }: AuthPageProps) {
    const [screen, setScreen] = useState<Screen>('signIn');
    const titleRef = useRef<HTMLHeadingElement>(null);

    // Mounting this page is always a return to sign-in, whether on first
    // visit or after signing out: moving focus here is what US-47 asks for in
    // the second case, and does no harm in the first, where nothing had focus
    // yet.
    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    return (
        <main className="auth-page" id="main-content">
            <h1 ref={titleRef} tabIndex={-1}>
                {title(screen)}
            </h1>
            <p className="auth-intro">{intro(screen)}</p>

            {screen === 'requestReset' ? (
                <RequestResetForm
                    isSubmitting={isSubmitting}
                    onSubmit={onRequestReset}
                    onBack={() => setScreen('signIn')}
                />
            ) : (
                <SignInOrRegister
                    screen={screen}
                    isSubmitting={isSubmitting}
                    onSignIn={onSignIn}
                    onRegister={onRegister}
                    onSwitch={setScreen}
                    onForgotPassword={() => setScreen('requestReset')}
                />
            )}
        </main>
    );
}
