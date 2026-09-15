import type { Membership } from '../domain/membership.js';

// Reading a project's members needs the service role: the only policy on
// project_memberships is project_memberships_select_self, so a session sees
// its own membership and never anyone else's. Authorization therefore lives in
// the use case, as it does for every outbound adapter of this application.
export interface MembershipRepository {
    // Everyone in the project, the caller included. Empty when the project
    // does not exist, which the use case cannot tell from « the caller is not
    // in it » -- and must not, since both answer the same way.
    membersOf(projectId: string): Promise<Membership[]>;
}
