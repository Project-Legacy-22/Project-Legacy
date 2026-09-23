import { useMemo, useState } from 'react';

import { guardSession } from './api/guard-session';
import { accountApi } from './api/account-api';
import { attentionApi } from './api/attention-api';
import type { AttentionApi } from './api/attention-api';
import type { AccountApi } from './api/account-api';
import { authApi } from './api/auth-api';
import type { AuthApi } from './api/auth-api';
import { credentialsApi } from './api/credentials-api';
import type { CredentialsApi } from './api/credentials-api';
import { itemsApi } from './api/items-api';
import type { ItemsApi } from './api/items-api';
import { notificationsApi } from './api/notifications-api';
import { projectsApi } from './api/projects-api';
import type { ProjectsApi } from './api/projects-api';
import type { NotificationsApi } from './api/notifications-api';
import { AccountSections } from './components/account-sections';
import type { CredentialsControls } from './components/account-sections';
import { AuthPage } from './components/auth-page';
import { HomeSection } from './components/home-section';
import { DeepLinkPages, useDeepLinkToken } from './components/deep-link-pages';
import { NotificationsPanel } from './components/notifications-panel';
import { PrivacyPolicyPage } from './components/privacy-policy-page';
import { SiteFooter } from './components/site-footer';
import { SessionBanner } from './components/session-banner';
import { TodoPage } from './components/todo-page';
import { SessionCheckScreen } from './components/session-check-screen';
import { useAttention } from './hooks/use-attention';
import { useCredentials } from './hooks/use-credentials';
import { useItems } from './hooks/use-items';
import { useNotifications } from './hooks/use-notifications';
import { useOpenFromHome } from './hooks/use-open-from-home';
import { useProjects } from './hooks/use-projects';
import { usePersonalData } from './hooks/use-personal-data';
import { useSession } from './hooks/use-session';
import type { SubmitResult } from './hooks/use-session';
import { saveFile } from './save-file';
import type { SaveFile } from './save-file';

// The policy is linkable, so it can be sent to somebody who has no account and
// so a browser reload stays on it.
function readsPolicy(): boolean {
    return new URLSearchParams(window.location.search).has('privacy');
}

export interface AppProps {
    api?: ItemsApi;
    auth?: AuthApi;
    account?: AccountApi;
    credentials?: CredentialsApi;
    notifications?: NotificationsApi;
    // Injected so a test can assert on what a download would have contained
    // without a jsdom that implements object URLs.
    save?: SaveFile;
    projects?: ProjectsApi;
    attention?: AttentionApi;
}

interface SignedInApis {
    api: ItemsApi;
    account: AccountApi;
    credentials: CredentialsApi;
    notifications: NotificationsApi;
    projects: ProjectsApi;
    attention: AttentionApi;
}

// The three clients the signed-in screen uses, each wrapped so that a 401 ends
// the session in the interface instead of being reported as one more failed
// request (US-27).
//
// Wrapped once and kept: useItems and useNotifications key their effects on the
// identity of the client they are given, so rebuilding these on every render
// would refetch on every render.
function useGuardedApis(apis: SignedInApis, onExpired: () => void): SignedInApis {
    const { api, account, credentials, notifications, projects, attention } = apis;

    return useMemo(
        () => ({
            api: guardSession(api, onExpired),
            account: guardSession(account, onExpired),
            credentials: guardSession(credentials, onExpired),
            notifications: guardSession(notifications, onExpired),
            projects: guardSession(projects, onExpired),
            attention: guardSession(attention, onExpired),
        }),
        [api, account, credentials, notifications, projects, attention, onExpired],
    );
}

interface SignedInAppProps {
    apis: SignedInApis;
    save: SaveFile;
    email: string;
    isSigningOut: boolean;
    credentials: CredentialsControls;
    onDeleted: () => void;
    onSignOut: () => Promise<SubmitResult>;
}

// Every change to a task reported back to onChange: the home screen above
// lists tasks by due date and priority, and must not keep showing one that was
// just completed or rescheduled below.
function useProjectItems(api: ItemsApi, projects: ReturnType<typeof useProjects>, onChange: () => void) {
    const items = useItems(api, projects.selectedProjectId);

    const addItem: typeof items.addItem = async (body) => {
        const result = await items.addItem(body);
        if (result.status === 'success') {
            projects.adjustSelectedItemCount(1);
            onChange();
        }
        return result;
    };

    const removeItem = async (item: Parameters<typeof items.removeItem>[0]) => {
        const removed = await items.removeItem(item);
        if (removed) {
            projects.adjustSelectedItemCount(-1);
            onChange();
        }
        return removed;
    };

    const reporting =
        <A extends unknown[]>(change: (...args: A) => Promise<boolean>) =>
        async (...args: A) => {
            const changed = await change(...args);
            if (changed) onChange();
            return changed;
        };

    return { ...items, addItem, removeItem, moveItem: reporting(items.moveItem), updateItem: reporting(items.updateItem) };
}

function itemsSectionProps(state: ReturnType<typeof useProjectItems>) {
    return {
        items: state.items,
        loadState: state.loadState,
        feedback: state.feedback,
        isAdding: state.isAdding,
        pendingItemIds: state.pendingItemIds,
        hasNextPage: state.hasNextPage,
        paginationState: state.paginationState,
        filterValues: state.filterValues,
        hasActiveFilters: state.hasActiveFilters,
        onAdd: state.addItem,
        onMove: state.moveItem,
        onReorder: state.reorderItem,
        onUpdate: state.updateItem,
        onRemove: state.removeItem,
        onLoadMore: state.loadMore,
        onRetry: state.retry,
        onSearchChange: state.onSearchChange,
        onStatusChange: state.onStatusChange,
        onPriorityChange: state.onPriorityChange,
        onDueDateChange: state.onDueDateChange,
        onNoDueDateChange: state.onNoDueDateChange,
        onClearFilters: state.onClearFilters,
    };
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
    credentials,
    onDeleted,
    onSignOut,
}: SignedInAppProps) {
    const projects = useProjects(apis.projects);
    const attention = useAttention(apis.attention);
    const state = useProjectItems(apis.api, projects, attention.reload);
    const openFromHome = useOpenFromHome(projects, state);
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
                {...itemsSectionProps(state)}
                selectedProject={projects.selectedProject}
                projects={projectSectionProps(projects)}
                home={<HomeSection {...attention} onOpen={openFromHome} />}
            >
                <AccountSections
                    email={email}
                    credentials={credentials}
                    personalData={personalData}
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
    credentials: credentialsApi,
    notifications: notificationsApi,
    save: saveFile,
    projects: projectsApi,
    attention: attentionApi,
};

export function App(props: AppProps) {
    const { api, auth, account, credentials, notifications, save, projects, attention } = { ...REAL, ...props };
    const session = useSession(auth);
    const recoveryToken = useDeepLinkToken('recovery');
    const emailChangeToken = useDeepLinkToken('email_change');
    const guarded = useGuardedApis({ api, account, credentials, notifications, projects, attention }, session.expire);
    const credentialActions = useCredentials(guarded.credentials);
    // The policy is a screen, not a route: this application chooses what to
    // show by state, and it must be readable before an account exists.
    const [showsPolicy, setShowsPolicy] = useState(readsPolicy());
    const openPolicy = () => setShowsPolicy(true);

    if (showsPolicy) {
        return <PolicyScreen onBack={() => setShowsPolicy(false)} onOpenPolicy={openPolicy} />;
    }

    if (recoveryToken !== null || emailChangeToken !== null) {
        return (
            <DeepLinkPages
                recoveryToken={recoveryToken}
                emailChangeToken={emailChangeToken}
                session={session}
                credentials={credentialActions}
            />
        );
    }

    // Waiting rather than showing the sign-in screen: the cookie is httpOnly,
    // so only the API can say whether a session is valid, and flashing a form
    // at someone already signed in would be wrong on every reload.
    // Both states go through a landmark with a heading, and the failure through
    // a retry. See session-check-screen.tsx for what they used to be.
    if (session.state.status === 'checking' || session.state.status === 'error') {
        return <SessionCheckScreen state={session.state} onRetry={session.recheck} />;
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
            credentials={credentialActions}
            onDeleted={session.forget}
            onOpenPolicy={openPolicy}
            onSignOut={session.signOut}
        />
    );
}
