import { authApi } from './api/auth-api';
import type { AuthApi } from './api/auth-api';
import { itemsApi } from './api/items-api';
import type { ItemsApi } from './api/items-api';
import { AuthPage } from './components/auth-page';
import { TodoPage } from './components/todo-page';
import { useItems } from './hooks/use-items';
import { useSession } from './hooks/use-session';
import { labels } from './labels';

export interface AppProps {
    api?: ItemsApi;
    auth?: AuthApi;
}

// The items screen is mounted in its own component so its data is only fetched
// once there is a session. Rendering it behind a condition in App would run its
// hooks anyway and fire a request that can only come back 401.
function SignedInApp({ api, email }: { api: ItemsApi; email: string }) {
    const state = useItems(api);

    return (
        <>
            <p className="session-banner">{labels.signedInAs(email)}</p>
            <TodoPage
                items={state.items}
                loadState={state.loadState}
                feedback={state.feedback}
                isAdding={state.isAdding}
                pendingItemIds={state.pendingItemIds}
                onAdd={state.addItem}
                onToggle={state.toggleItem}
                onRemove={state.removeItem}
                onRetry={state.retry}
            />
        </>
    );
}

export function App({ api = itemsApi, auth = authApi }: AppProps) {
    const session = useSession(auth);

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
                isSubmitting={session.isSubmitting}
                onSignIn={session.signIn}
                onRegister={session.register}
            />
        );
    }

    return <SignedInApp api={api} email={session.state.account.email} />;
}
