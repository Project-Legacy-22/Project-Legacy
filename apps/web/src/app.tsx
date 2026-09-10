import { useEffect, useMemo, useRef, useState } from 'react';

import { guardSession } from './api/guard-session';
import { accountApi } from './api/account-api';
import type { AccountApi } from './api/account-api';
import { authApi } from './api/auth-api';
import type { AuthApi } from './api/auth-api';
import { itemsApi } from './api/items-api';
import type { ItemsApi } from './api/items-api';
import { notificationsApi } from './api/notifications-api';
import { projectsApi } from './api/projects-api';
import type { ProjectsApi } from './api/projects-api';
import type { NotificationsApi } from './api/notifications-api';
import { AuthPage } from './components/auth-page';
import { NotificationsPanel } from './components/notifications-panel';
import { PrivacyPolicyPage } from './components/privacy-policy-page';
import { SiteFooter } from './components/site-footer';
import { PersonalDataSection } from './components/personal-data-section';
import { ResetPasswordPage } from './components/reset-password-page';
import { SessionBanner } from './components/session-banner';
import { TodoPage } from './components/todo-page';
import { useItems } from './hooks/use-items';
import { useNotifications } from './hooks/use-notifications';
import { useProjects } from './hooks/use-projects';
import { usePersonalData } from './hooks/use-personal-data';
import { useSession } from './hooks/use-session';
import type { SubmitResult } from './hooks/use-session';
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

// Split out of App to keep that function under the project's line-per-function
// ceiling: reading the token and clearing it from the address bar is one
// self-contained concern.
function useRecoveryToken(): string | null {
    const recoveryToken = useRef(readRecoveryToken());

    useEffect(() => {
        if (recoveryToken.current !== null) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    return recoveryToken.current;
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
    projects?: ProjectsApi;
}

interface SignedInApis {
    api: ItemsApi;
    account: AccountApi;
    notifications: NotificationsApi;
    projects: ProjectsApi;
}

// The three clients the signed-in screen uses, each wrapped so that a 401 ends
// the session in the interface instead of being reported as one more failed
// request (US-27).
//
// Wrapped once and kept: useItems and useNotifications key their effects on the
// identity of the client they are given, so rebuilding these on every render
// would refetch on every render.
function useGuardedApis(apis: SignedInApis, onExpired: () => void): SignedInApis {
    const { api, account, notifications, projects } = apis;

    return useMemo(
        () => ({
            api: guardSession(api, onExpired),
            account: guardSession(account, onExpired),
            notifications: guardSession(notifications, onExpired),
            projects: guardSession(projects, onExpired),
        }),
        [api, account, notifications, projects, onExpired],
    );
}

interface SignedInAppProps {
    apis: SignedInApis;
    save: SaveFile;
    email: string;
    isSigningOut: boolean;
    onDeleted: () => void;
    onSignOut: () => Promise<SubmitResult>;
}

function useProjectItems(api: ItemsApi, projects: ReturnType<typeof useProjects>) {
    const items = useItems(api, projects.selectedProjectId);

    const addItem = async (name: string) => {
        const result = await items.addItem(name);
        if (result.status === 'success') {
            projects.adjustSelectedItemCount(1);
        }
        return result;
    };

    const removeItem = async (item: Parameters<typeof items.removeItem>[0]) => {
        const removed = await items.removeItem(item);
        if (removed) {
            projects.adjustSelectedItemCount(-1);
        }
        return removed;
    };

    return { ...items, addItem, removeItem };
}

function projectSectionProps(projects: ReturnType<typeof useProjects>) {
    return {
        projects: projects.projects,
        selectedProjectId: projects.selectedProjectId,
        loadState: projects.loadState,
        feedback: projects.feedback,
        isAdding: projects.isAdding,
        pendingProjectId: projects.pendingProjectId,
        hasNextPage: projects.hasNextPage,
        paginationState: projects.paginationState,
        onSelect: projects.selectProject,
        onAdd: projects.addProject,
        onRemove: projects.removeProject,
        onLoadMore: projects.loadMore,
        onRetry: projects.retry,
    };
}

// The items screen is mounted in its own component so its data is only fetched
// once there is a session. Rendering it behind a condition in App would run its
// hooks anyway and fire a request that can only come back 401.
function SignedInApp({
    apis,
    save,
    email,
    isSigningOut,
    onDeleted,
    onSignOut,
}: SignedInAppProps) {
    const projects = useProjects(apis.projects);
    const state = useProjectItems(apis.api, projects);
    const personalData = usePersonalData({ api: apis.account, save, onDeleted });
    const unread = useNotifications(apis.notifications, true);

    return (
        <>
            <SessionBanner
                email={email}
                unread={unread}
                isSigningOut={isSigningOut}
                onSignOut={onSignOut}
            />
            <NotificationsPanel api={apis.notifications} />
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
                onRename={state.renameItem}
                onRemove={state.removeItem}
                onLoadMore={state.loadMore}
                onRetry={state.retry}
                selectedProject={projects.selectedProject}
                projects={projectSectionProps(projects)}
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
    notice,
    onOpenPolicy,
}: {
    session: ReturnType<typeof useSession>;
    // Read in App, where the state is narrowed to anonymous: inside this
    // component the union is whole again and notice is not on every variant.
    notice: string | undefined;
    onOpenPolicy: () => void;
}) {
    return (
        <>
            <AuthPage
                notice={notice}
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
    projects: projectsApi,
};

export function App(props: AppProps) {
    const { api, auth, account, notifications, save, projects } = { ...REAL, ...props };
    const session = useSession(auth);
    const recoveryToken = useRecoveryToken();
    const guarded = useGuardedApis({ api, account, notifications, projects }, session.expire);
    // The policy is a screen, not a route: this application chooses what to
    // show by state, and it must be readable before an account exists.
    const [showsPolicy, setShowsPolicy] = useState(readsPolicy());
    const openPolicy = () => setShowsPolicy(true);

    if (showsPolicy) {
        return <PolicyScreen onBack={() => setShowsPolicy(false)} onOpenPolicy={openPolicy} />;
    }

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
            <AnonymousScreen
                session={session}
                notice={session.state.notice}
                onOpenPolicy={openPolicy}
            />
        );
    }

    return (
        <SignedInScreen
            apis={guarded}
            save={save}
            email={session.state.account.email}
            isSigningOut={session.isSubmitting}
            onDeleted={session.forget}
            onOpenPolicy={openPolicy}
            onSignOut={session.signOut}
        />
    );
}
