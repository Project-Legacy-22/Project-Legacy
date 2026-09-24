import { createContext, useContext } from 'react';

import type { ProjectMemberDto } from '../api/members-api';

// The members of the selected project, for the task cards and their edit form
// (US-58). A context rather than a prop threaded through the section, the
// board and the row, none of which uses it. Empty by default: a task rendered
// outside a project offers no assignment.
export const ProjectMembersContext = createContext<readonly ProjectMemberDto[]>([]);

export function useProjectMemberList(): readonly ProjectMemberDto[] {
    return useContext(ProjectMembersContext);
}

export function memberEmail(members: readonly ProjectMemberDto[], userId: string | null): string | undefined {
    return userId === null ? undefined : members.find(member => member.userId === userId)?.email;
}
