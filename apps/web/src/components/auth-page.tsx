import { useEffect, useRef, useState } from 'react';

import { labels } from '../labels';
import { AuthForm } from './auth-form';
import type { AuthMode } from './auth-form';
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
    onOpenPolicy: () => void;
    isSubmitting: boolean;
    onSignIn: (email: string, password: string) => Promise<SubmitResult>;
    onRegister: (email: string, password: string) => Promise<SubmitResult>;
    onRequestReset: (email: string) => Promise<SubmitResult>;
}

interface SignInOrRegisterProps {
    screen: AuthMode;
    isSubmitting: boolean;
    onSignIn: (email: string, password: string) => Promise<SubmitResult>;
    onRegister: (email: string, password: string) => Promise<SubmitResult>;
    onSwitch: (screen: AuthMode) => void;
    onForgotPassword: () => void;
    onOpenPolicy: () => void;
}

function SignInOrRegister({
    screen,
    isSubmitting,
    onSignIn,
    onRegister,
    onSwitch,
    onForgotPassword,
    onOpenPolicy,
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
                onOpenPolicy={onOpenPolicy}
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

export function AuthPage({
    notice,
    isSubmitting,
    onSignIn,
    onRegister,
    onRequestReset,
    onOpenPolicy,
}: AuthPageProps) {
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
            <AuthHeading screen={screen} notice={notice} titleRef={titleRef} />

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
                    onOpenPolicy={onOpenPolicy}
                />
            )}
        </main>
    );
}
