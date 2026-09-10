import { useEffect, useMemo, useRef } from 'react';

import { accountApi } from './api/account-api';
import type { AccountApi } from './api/account-api';
import { authApi } from './api/auth-api';
import type { AuthApi } from './api/auth-api';
import { guardSession } from './api/guard-session';
import { itemsApi } from './api/items-api';
import type { ItemsApi } from './api/items-api';
import { notificationsApi } from './api/notifications-api';
import type { NotificationsApi } from './api/notifications-api';
import { AuthPage } from './components/auth-page';
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

function readRecoveryToken(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('type') === 'recovery' ? params.get('token_hash') : null;
}

// The recovery email links here with the token hash as a query parameter. It is
// read once, on the first render, and then wiped from the address bar so it
// stops sitting in history or leaking through a Referer on the next navigation.
function useRecoveryToken(): string | null {
    const token = useRef(readRecoveryToken());

    useEffect(() => {
        if (token.current !== null) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    return token.current;
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
    apis: SignedInApis;
    save: SaveFile;
    email: string;
    onDeleted: () => void;
}

// The items screen is mounted in its own component so its data is only fetched
// once there is a session. Rendering it behind a condition in App would run its
// hooks anyway and fire a request that can only come back 401.
function SignedInApp({ apis, save, email, onDeleted }: SignedInAppProps) {
    const state = useItems(apis.api);
    const personalData = usePersonalData({ api: apis.account, save, onDeleted });
    const unread = useNotifications(apis.notifications, true);

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

interface SignedInApis {
    api: ItemsApi;
    account: AccountApi;
    notifications: NotificationsApi;
}

// The three clients the signed-in screen uses, each wrapped so that a 401 ends
// the session in the interface instead of being reported as one more failed
// request (US-27).
//
// Wrapped once and kept: useItems and useNotifications key their effects on the
// identity of the client they are given, so rebuilding these on every render
// would refetch on every render.
function useGuardedApis(apis: SignedInApis, onExpired: () => void): SignedInApis {
    const { api, account, notifications } = apis;

    return useMemo(
        () => ({
            api: guardSession(api, onExpired),
            account: guardSession(account, onExpired),
            notifications: guardSession(notifications, onExpired),
        }),
        [api, account, notifications, onExpired],
    );
}

export function App({
    api = itemsApi,
    auth = authApi,
    account = accountApi,
    notifications = notificationsApi,
    save = saveFile,
}: AppProps) {
    const session = useSession(auth);
    const recoveryToken = useRecoveryToken();
    const guarded = useGuardedApis({ api, account, notifications }, session.expire);

    // A recovery link wins over everything else, including a live session: the
    // person following it wants to set a new password, not see their items.
    if (recoveryToken !== null) {
        return (
            <ResetPasswordPage
                token={recoveryToken}
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
        return (
            <AuthPage
                notice={session.state.notice}
                isSubmitting={session.isSubmitting}
                onSignIn={session.signIn}
                onRegister={session.register}
                onRequestReset={session.requestPasswordReset}
            />
        );
    }

    return (
        <SignedInApp
            apis={guarded}
            save={save}
            email={session.state.account.email}
            onDeleted={session.forget}
        />
    );
}
