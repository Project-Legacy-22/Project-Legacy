import type { Membership, MembershipRepository } from '../../src/index.js';

// Seeded flat, one row per membership, because that is the shape the table has:
// a composite key of project and account. Grouping by project in the fixture
// would hide the case the use case exists for -- a caller asking for a project
// they are not in.
export interface SeededMembership extends Membership {
    projectId: string;
}

export function inMemoryMembershipRepository(
    seed: readonly SeededMembership[] = [],
): MembershipRepository {
    return {
        membersOf(projectId) {
            return Promise.resolve(
                seed
                    .filter(row => row.projectId === projectId)
                    .map(row => ({ userId: row.userId, email: row.email, role: row.role })),
            );
        },
    };
}
