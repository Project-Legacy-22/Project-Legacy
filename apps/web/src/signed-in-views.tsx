import { AccountSections } from './components/account-sections';
import type { CredentialsControls } from './components/account-sections';
import { HomeSection } from './components/home-section';
import { MembersSection, NoProjectMembers } from './components/members-section';
import type { useAttention } from './hooks/use-attention';
import type { SignedInApis } from './hooks/use-guarded-apis';
import type { useOpenFromHome } from './hooks/use-open-from-home';
import type { usePersonalData } from './hooks/use-personal-data';
import type { useProjects } from './hooks/use-projects';
import type { useView } from './hooks/use-view';

export interface ViewNodesArgs {
    apis: SignedInApis;
    email: string;
    credentials: CredentialsControls;
    personalData: ReturnType<typeof usePersonalData>;
    projects: ReturnType<typeof useProjects>;
    attention: ReturnType<typeof useAttention>;
    openFromHome: ReturnType<typeof useOpenFromHome>;
    navigate: ReturnType<typeof useView>['navigate'];
    onMemberRemoved: () => void;
}

// The three views TodoPage does not build itself (#446).
export function viewNodes(a: ViewNodesArgs) {
    return {
        home: (
            <HomeSection
                {...a.attention}
                // The task is focused by openFromHome once the list holds it, so
                // the view does not take focus itself.
                onOpen={item => {
                    a.navigate('projects', null);
                    a.openFromHome(item);
                }}
                onShowProjects={target => a.navigate('projects', target)}
            />
        ),
        members:
            a.projects.selectedProject === null ? (
                <NoProjectMembers onGoToProjects={() => a.navigate('projects')} />
            ) : (
                <MembersSection
                    api={a.apis.members}
                    project={a.projects.selectedProject}
                    currentEmail={a.email}
                    onRemoved={a.onMemberRemoved}
                />
            ),
        account: <AccountSections email={a.email} credentials={a.credentials} personalData={a.personalData} />,
    };
}
