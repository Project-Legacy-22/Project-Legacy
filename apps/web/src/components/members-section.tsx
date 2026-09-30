import type { MembersApi, ProjectMemberDto } from '../api/members-api';
import type { ProjectDto } from '../api/projects-api';
import { useProjectMembers } from '../hooks/use-project-members';
import { labels } from '../labels';
import { ActionFeedback } from './action-feedback';
import { InviteMemberForm } from './invite-member-form';
import { ViewState } from './view-state';

export interface MembersSectionProps {
    api: MembersApi;
    project: ProjectDto;
    currentEmail: string;
    // Their tasks were unassigned by the removal (US-58).
    onRemoved?: () => void;
}

interface MemberListProps {
    project: ProjectDto;
    currentEmail: string;
    members: readonly ProjectMemberDto[];
    pendingUserId: string | null;
    onRemove: (member: ProjectMemberDto) => Promise<boolean>;
}

// An owner removes the others. Not themselves: the interface makes no second
// owner, so an owner leaving would always be refused as the last one.
function MemberList({ project, currentEmail, members, pendingUserId, onRemove }: MemberListProps) {
    const remove = (member: ProjectMemberDto) => {
        if (!globalThis.confirm(labels.confirmMemberRemoval(member.email, project.name))) return;
        void onRemove(member);
    };

    return (
        <ul id="members-list" className="projects-list">
            {members.map(member => (
                <li key={member.userId} className="member-row">
                    <span className="project-name">
                        {member.email} {member.email === currentEmail && labels.you}
                    </span>
                    <span className="project-count">{labels.memberRole(member.role)}</span>
                    {project.role === 'owner' && member.email !== currentEmail && (
                        <button
                            className="button button-danger"
                            type="button"
                            aria-label={labels.removeMember(member.email)}
                            disabled={pendingUserId === member.userId}
                            onClick={() => remove(member)}
                        >
                            {labels.remove}
                        </button>
                    )}
                </li>
            ))}
        </ul>
    );
}

type MembersState = ReturnType<typeof useProjectMembers>;

function MembersContent({ project, currentEmail, members }: Omit<MembersSectionProps, 'api'> & { members: MembersState }) {
    return (
        <div id="members-content">
            {project.role === 'owner' && <InviteMemberForm isInviting={members.isInviting} onInvite={members.invite} />}
            <ViewState
                state={members.loadState}
                loadingMessage={labels.loadingMembers}
                empty={{
                    isEmpty: members.members.length === 0,
                    message: labels.emptyMembers,
                    unfillable: labels.emptyMembersReason,
                }}
                onRetry={members.retry}
            >
                <MemberList
                    project={project}
                    currentEmail={currentEmail}
                    members={members.members}
                    pendingUserId={members.pendingUserId}
                    onRemove={members.remove}
                />
            </ViewState>
            <ActionFeedback feedback={members.feedback} />
        </div>
    );
}

// Its own view since #446, which is what the collapsed panel used to provide:
// who is in a project is looked at when inviting or tidying up, and the list is
// fetched when somebody opens the view, not on every visit to the projects.
export function MembersSection({ api, project, currentEmail, onRemoved }: MembersSectionProps) {
    const state = useProjectMembers(api, project.id);
    const members: MembersState = {
        ...state,
        remove: async member => {
            const removed = await state.remove(member);
            if (removed) onRemoved?.();
            return removed;
        },
    };

    return (
        <section
            className="panel members-panel"
            aria-labelledby="members-heading"
            aria-busy={members.loadState.status === 'loading'}
        >
            <div className="section-heading">
                <h2 id="members-heading" tabIndex={-1}>
                    {labels.membersTitle(project.name)}
                </h2>
            </div>
            <MembersContent project={project} currentEmail={currentEmail} members={members} />
        </section>
    );
}

// The members view before a project is chosen: members belong to a project, and
// the way to choose one is named rather than left to guess.
export function NoProjectMembers({ onGoToProjects }: { onGoToProjects: () => void }) {
    return (
        <section className="panel" aria-labelledby="members-heading">
            <div className="section-heading">
                <h2 id="members-heading" tabIndex={-1}>
                    {labels.viewName('members')}
                </h2>
            </div>
            <div className="empty-message">
                <p>{labels.membersNoProject}</p>
                <button className="button button-secondary" type="button" onClick={onGoToProjects}>
                    {labels.goToProjects}
                </button>
            </div>
        </section>
    );
}
