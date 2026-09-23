export {
    createProject,
    rehydrateProject,
    projectName,
    ProjectError,
    InvalidProjectName,
    InvalidProjectCursor,
    ProjectNotFound,
    MAX_PROJECT_NAME_LENGTH,
} from './domain/project.js';
export type { Project, ProjectRole } from './domain/project.js';
export type { Membership } from './domain/membership.js';
export { MEMBERSHIP_CREATED_V1, membershipCreated } from './domain/event.js';
export type { DomainEvent, MembershipCreatedV1 } from './domain/event.js';
export {
    assertCanRemoveMember,
    LastProjectOwner,
    ProjectMemberNotFound,
    ProjectOwnerRequired,
} from './domain/member-removal.js';
export type { MemberRemoval } from './domain/member-removal.js';

export type { ProjectRepository, ProjectPage, ProjectPageQuery } from './ports/project-repository.js';
export type { MembershipRepository } from './ports/membership-repository.js';
export type { MemberRemovalRepository } from './ports/member-removal-repository.js';

export { makeListProjects } from './application/list-projects.js';
export { makeAddProject } from './application/add-project.js';
export { makeRemoveProject } from './application/remove-project.js';
export { makeListProjectMembers } from './application/list-project-members.js';
export { makeRemoveProjectMember } from './application/remove-project-member.js';
export type { AddProjectDependencies } from './application/add-project.js';
