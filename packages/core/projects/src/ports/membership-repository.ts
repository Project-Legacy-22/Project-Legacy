import type { DomainEvent } from '../domain/event.js';
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
    // The membership and the event announcing it are written together or not at all. Two requests
    // would be two transactions, and a failure between them would leave either a member nobody
    // announced or an announcement without a membership -- exactly what the outbox exists to
    // prevent (ADR-0007).
    //
    // Returns false when the person was already a member: no membership created, so no event
    // emitted. Adding twice does not notify twice.
    addWithEvent(
        addition: { projectId: string; memberId: string },
        event: DomainEvent,
    ): Promise<boolean>;
}
