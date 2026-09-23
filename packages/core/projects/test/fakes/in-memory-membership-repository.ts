import { assertCanRemoveMember } from '../../src/index.js';
import type { DomainEvent, Membership, MemberRemovalRepository } from '../../src/index.js';

// Seeded flat, one row per membership, because that is the shape the table has:
// a composite key of project and account. Grouping by project in the fixture
// would hide the case the use case exists for -- a caller asking for a project
// they are not in.
export interface SeededMembership extends Membership {
    projectId: string;
}

// The events are kept rather than dropped: the rule worth asserting is not
// only that a membership appears, but that adding someone twice announces it
// once. A fake that forgot the events could not show that.
export interface InMemoryMembershipRepository extends MemberRemovalRepository {
    rows: SeededMembership[];
    events: DomainEvent[];
}

// The address the fake gives someone it was not seeded with. The real adapter
// reads it from the join; here it only has to be stable and recognisable.
function addressOf(memberId: string): string {
    return `${memberId}@example.com`;
}

export function inMemoryMembershipRepository(
    seed: readonly SeededMembership[] = [],
): InMemoryMembershipRepository {
    const rows = seed.map(row => ({ ...row }));
    const events: DomainEvent[] = [];

    return {
        rows,
        events,

        membersOf(projectId) {
            return Promise.resolve(
                rows
                    .filter(row => row.projectId === projectId)
                    .map(row => ({ userId: row.userId, email: row.email, role: row.role })),
            );
        },

        addWithEvent({ projectId, memberId }, event) {
            const already = rows.some(
                row => row.projectId === projectId && row.userId === memberId,
            );
            // Nothing written, nothing announced -- the composite key of the
            // real table, and the `on conflict do nothing` of the function.
            if (already) return Promise.resolve(false);

            rows.push({
                projectId,
                userId: memberId,
                email: addressOf(memberId),
                role: 'member',
            });
            events.push(event);

            return Promise.resolve(true);
        },

        removeMember(removal) {
            const members = rows.filter(row => row.projectId === removal.projectId);
            assertCanRemoveMember(members, removal);
            const index = rows.findIndex(
                row => row.projectId === removal.projectId && row.userId === removal.memberId,
            );
            if (index !== -1) rows.splice(index, 1);
            return Promise.resolve();
        },
    };
}
