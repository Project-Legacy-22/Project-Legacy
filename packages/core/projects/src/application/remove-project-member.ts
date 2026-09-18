import { assertCanRemoveMember } from '../domain/member-removal.js';
import type { MemberRemoval } from '../domain/member-removal.js';
import type { MemberRemovalRepository } from '../ports/member-removal-repository.js';

export function makeRemoveProjectMember(repository: MemberRemovalRepository) {
    return async function removeProjectMember(removal: MemberRemoval): Promise<void> {
        const members = await repository.membersOf(removal.projectId);
        assertCanRemoveMember(members, removal);
        await repository.removeMember(removal);
    };
}
