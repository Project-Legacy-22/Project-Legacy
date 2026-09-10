import { useEffect, useRef, useState } from 'react';

import { accountApi } from './api/account-api';
import type { AccountApi } from './api/account-api';
import { authApi } from './api/auth-api';
import type { AuthApi } from './api/auth-api';
import { itemsApi } from './api/items-api';
import type { ItemsApi } from './api/items-api';
import { notificationsApi } from './api/notifications-api';
import type { NotificationsApi } from './api/notifications-api';
import { AuthPage } from './components/auth-page';
import { PrivacyPolicyPage } from './components/privacy-policy-page';
import { SiteFooter } from './components/site-footer';
import { PersonalDataSection } from './components/personal-data-section';
import { ResetPasswordPage } from './components/reset-password-page';
import { TodoPage } from './components/todo-page';
import { useItems } from './hooks/use-items';
import { useNotifications } from './hooks/use-notifications';
import { usePersonalData } from './hooks/use-personal-data';
import { useSession } from './hooks/use-session';
import { labels } from './labels';
import { saveFile } from './save-file';
import type { SaveFile } from './save-file';

// The recovery email links here with the token hash as a query parameter. It is
// read once, on the first render, and then wiped from the address bar so it
// stops sitting in history or leaking through a Referer on the next navigation.
function readRecoveryToken(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('type') === 'recovery' ? params.get('token_hash') : null;
}

// The policy is linkable, so it can be sent to somebody who has no account and
// so a browser reload stays on it.
function readsPolicy(): boolean {
    return new URLSearchParams(window.location.search).has('privacy');
}

export interface AppProps {
    api?: ItemsApi;
    auth?: AuthApi;
    account?: AccountApi;
    notifications?: NotificationsApi;
    // Injected so a test can assert on what a download would have contained
    // without a jsdom that implements object URLs.
    save?: SaveFile;
}

interface SignedInAppProps {
    api: ItemsApi;
    account: AccountApi;
    notifications: NotificationsApi;
    save: SaveFile;
    email: string;
    onDeleted: () => void;
}

// The items screen is mounted in its own component so its data is only fetched
// once there is a session. Rendering it behind a condition in App would run its
// hooks anyway and fire a request that can only come back 401.
function SignedInApp({ api, account, notifications, save, email, onDeleted }: SignedInAppProps) {
    const state = useItems(api);
    const personalData = usePersonalData({ api: account, save, onDeleted });
    const unread = useNotifications(notifications, true);

    return (
        <>
            <p className="session-banner">
                {labels.signedInAs(email)}
                {/* role="status" : le compte change tout seul, quand le worker a
                    traite l evenement. L annoncer sans interrompre la lecture est
                    exactement ce pour quoi ce role existe. */}
                <span className="notification-badge" role="status">
                    {labels.unreadNotifications(unread)}
                </span>
            </p>
            <TodoPage
                items={state.items}
                loadState={state.loadState}
                feedback={state.feedback}
                isAdding={state.isAdding}
                pendingItemIds={state.pendingItemIds}
                hasNextPage={state.hasNextPage}
                paginationState={state.paginationState}
                onAdd={state.addItem}
                onToggle={state.toggleItem}
                onRemove={state.removeItem}
                onLoadMore={state.loadMore}
                onRetry={state.retry}
            >
                <PersonalDataSection
                    email={email}
                    activity={personalData.activity}
                    feedback={personalData.feedback}
                    onExport={personalData.exportPersonalData}
                    onDelete={personalData.deleteAccount}
                />
            </TodoPage>
        </>
    );
}

// Extracted so App stays a sequence of decisions rather than a mix of decisions
// and markup.
function AnonymousScreen({
    session,
    onOpenPolicy,
}: {
    session: ReturnType<typeof useSession>;
    onOpenPolicy: () => void;
}) {
    return (
        <>
            <AuthPage
                isSubmitting={session.isSubmitting}
                onSignIn={session.signIn}
                onRegister={session.register}
                onRequestReset={session.requestPasswordReset}
                onOpenPolicy={onOpenPolicy}
            />
            <SiteFooter onOpenPolicy={onOpenPolicy} />
        </>
    );
}

// The token is read once, then wiped from the address bar so it stops sitting
// in history and leaking through a Referer on the next navigation.
function useWipedRecoveryToken(token: string | null): void {
    useEffect(() => {
        if (token !== null) window.history.replaceState(null, '', window.location.pathname);
        // Runs once: the token is read on the first render and never changes.
    }, []);
}

function PolicyScreen({ onBack, onOpenPolicy }: { onBack: () => void; onOpenPolicy: () => void }) {
    return (
        <>
            <PrivacyPolicyPage onBack={onBack} />
            <SiteFooter onOpenPolicy={onOpenPolicy} />
        </>
    );
}

function SignedInScreen({ onOpenPolicy, ...props }: SignedInAppProps & { onOpenPolicy: () => void }) {
    return (
        <>
            <SignedInApp {...props} />
            <SiteFooter onOpenPolicy={onOpenPolicy} />
        </>
    );
}

// The real clients, in one place. Spread over the props rather than written as
// five default parameters: each default is a branch, and five of them push this
// component past the complexity a reader can hold.
const REAL: Required<AppProps> = {
    api: itemsApi,
    auth: authApi,
    account: accountApi,
    notifications: notificationsApi,
    save: saveFile,
};

export function App(props: AppProps) {
    const { api, auth, account, notifications, save } = { ...REAL, ...props };
    const session = useSession(auth);
    const recoveryToken = useRef(readRecoveryToken());
    // The policy is a screen, not a route: this application chooses what to
    // show by state, and it must be readable before an account exists.
    const [showsPolicy, setShowsPolicy] = useState(readsPolicy());
    const openPolicy = () => setShowsPolicy(true);

    useWipedRecoveryToken(recoveryToken.current);

    if (showsPolicy) {
        return <PolicyScreen onBack={() => setShowsPolicy(false)} onOpenPolicy={openPolicy} />;
    }

    // A recovery link wins over everything else, including a live session: the
    // person following it wants to set a new password, not see their items.
    if (recoveryToken.current !== null) {
        return (
            <ResetPasswordPage
                token={recoveryToken.current}
                isSubmitting={session.isSubmitting}
                onSubmit={session.resetPassword}
            />
        );
    }

    // Waiting rather than showing the sign-in screen: the cookie is httpOnly,
    // so only the API can say whether a session is valid, and flashing a form
    // at someone already signed in would be wrong on every reload.
    if (session.state.status === 'checking') {
        return <p role="status">{labels.checkingSession}</p>;
    }

    if (session.state.status === 'error') {
        return <p role="alert">{session.state.message}</p>;
    }

    // The interface keeps the visitor out on its own, rather than mounting the
    // items screen and relying on the API to refuse it. Both guards are needed:
    // this one for what is displayed, the API's for what is served.
    if (session.state.status === 'anonymous') {
        return <AnonymousScreen session={session} onOpenPolicy={openPolicy} />;
    }

    return (
        <SignedInScreen
            api={api}
            account={account}
            notifications={notifications}
            save={save}
            email={session.state.account.email}
            onDeleted={session.forget}
            onOpenPolicy={openPolicy}
        />
    );
}
