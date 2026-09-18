import { assertCanRemoveMember } from '../../src/index.js';
import type { Membership, MemberRemovalRepository } from '../../src/index.js';

// Seeded flat, one row per membership, because that is the shape the table has:
// a composite key of project and account. Grouping by project in the fixture
// would hide the case the use case exists for -- a caller asking for a project
// they are not in.
export interface SeededMembership extends Membership {
    projectId: string;
}

export function inMemoryMembershipRepository(
    seed: readonly SeededMembership[] = [],
): MemberRemovalRepository {
    let memberships = seed.map(row => ({ ...row }));
    return {
        membersOf(projectId) {
            return Promise.resolve(
                memberships
                    .filter(row => row.projectId === projectId)
                    .map(row => ({ userId: row.userId, email: row.email, role: row.role })),
            );
        },
        removeMember(removal) {
            const members = memberships.filter(row => row.projectId === removal.projectId);
            assertCanRemoveMember(members, removal);
            memberships = memberships.filter(
                row => row.projectId !== removal.projectId || row.userId !== removal.memberId,
            );
            return Promise.resolve();
        },
    };
}
