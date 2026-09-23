import { ProjectNotFound } from '../domain/project.js';
import type { Membership } from '../domain/membership.js';
import type { MembershipRepository } from '../ports/membership-repository.js';

export function makeListProjectMembers(repository: MembershipRepository) {
    return async function listProjectMembers(
        projectId: string,
        callerId: string,
    ): Promise<Membership[]> {
        // One query, and the authorization derived from what it returned.
        // Asking « what is my role » first and then « who are the members »
        // would be two round trips for the same rows.
        const members = await repository.membersOf(projectId);

        // Answered like a project that does not exist, not like one the caller
        // may not read. A 403 here would confirm the project exists to anyone
        // guessing identifiers -- the posture items and notifications already
        // take (US-12, US-18).
        if (!members.some(member => member.userId === callerId)) {
            throw new ProjectNotFound(projectId);
        }

        return members;
    };
}
