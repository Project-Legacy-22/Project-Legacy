import type { Membership } from './membership.js';
import { ProjectError, ProjectNotFound } from './project.js';

export interface MemberRemoval {
    projectId: string;
    callerId: string;
    memberId: string;
}

export class ProjectOwnerRequired extends ProjectError {
    constructor() {
        super('project_owner_required', 403, 'Only a project owner can remove a member');
    }
}

export class ProjectMemberNotFound extends ProjectError {
    constructor() {
        super('project_member_not_found', 404, 'Project member not found');
    }
}

export class LastProjectOwner extends ProjectError {
    constructor() {
        super('last_project_owner', 409, 'A project must keep at least one owner');
    }
}

export function assertCanRemoveMember(members: readonly Membership[], removal: MemberRemoval): void {
    const caller = members.find(member => member.userId === removal.callerId);
    if (caller === undefined) throw new ProjectNotFound(removal.projectId);
    if (caller.role !== 'owner') throw new ProjectOwnerRequired();

    const target = members.find(member => member.userId === removal.memberId);
    if (target === undefined) throw new ProjectMemberNotFound();

    const anotherOwner = members.some(
        member => member.role === 'owner' && member.userId !== removal.memberId,
    );
    if (target.role === 'owner' && !anotherOwner) throw new LastProjectOwner();
}
