import { useEffect, useRef } from 'react';

import { accountApi } from './api/account-api';
import type { AccountApi } from './api/account-api';
import { authApi } from './api/auth-api';
import type { AuthApi } from './api/auth-api';
import { itemsApi } from './api/items-api';
import type { ItemsApi } from './api/items-api';
import { notificationsApi } from './api/notifications-api';
import type { NotificationsApi } from './api/notifications-api';
import { projectsApi } from './api/projects-api';
import type { ProjectsApi } from './api/projects-api';
import { AuthPage } from './components/auth-page';
import { PersonalDataSection } from './components/personal-data-section';
import { ResetPasswordPage } from './components/reset-password-page';
import { TodoPage } from './components/todo-page';
import { useItems } from './hooks/use-items';
import { useNotifications } from './hooks/use-notifications';
import { usePersonalData } from './hooks/use-personal-data';
import { useSession } from './hooks/use-session';
import { useProjects } from './hooks/use-projects';
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

function useRecoveryToken(): string | null {
    const recoveryToken = useRef(readRecoveryToken());

    useEffect(() => {
        if (recoveryToken.current !== null) {
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    return recoveryToken.current;
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

interface SignedInAppProps {
    api: ItemsApi;
    account: AccountApi;
    notifications: NotificationsApi;
    save: SaveFile;
    projectsApi: ProjectsApi;
    email: string;
    onDeleted: () => void;
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
function SignedInApp({ api, account, notifications, save, projectsApi, email, onDeleted }: SignedInAppProps) {
    const projects = useProjects(projectsApi);
    const items = useProjectItems(api, projects);
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
                items={items.items}
                loadState={items.loadState}
                feedback={items.feedback}
                isAdding={items.isAdding}
                pendingItemIds={items.pendingItemIds}
                hasNextPage={items.hasNextPage}
                paginationState={items.paginationState}
                onAdd={items.addItem}
                onToggle={items.toggleItem}
                onRemove={items.removeItem}
                onLoadMore={items.loadMore}
                onRetry={items.retry}
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

function resolveAppProps({
    api = itemsApi,
    auth = authApi,
    account = accountApi,
    notifications = notificationsApi,
    save = saveFile,
    projects = projectsApi,
}: AppProps) {
    return { api, auth, account, notifications, save, projects };
}

export function App(props: AppProps) {
    const { api, auth, account, notifications, save, projects } = resolveAppProps(props);
    const session = useSession(auth);
    const recoveryToken = useRecoveryToken();

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
                isSubmitting={session.isSubmitting}
                onSignIn={session.signIn}
                onRegister={session.register}
                onRequestReset={session.requestPasswordReset}
            />
        );
    }

    return (
        <SignedInApp
            api={api}
            account={account}
            notifications={notifications}
            save={save}
            projectsApi={projects}
            email={session.state.account.email}
            onDeleted={session.forget}
        />
    );
}
