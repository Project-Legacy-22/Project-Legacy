import type { MemberRemoval } from '../domain/member-removal.js';
import type { MembershipRepository } from './membership-repository.js';

export interface MemberRemovalRepository extends MembershipRepository {
    // Recheck the caller's role and the remaining owners in the same
    // transaction as deletion: the use case's earlier read can be stale.
    // Refusals raise the same domain errors and leave every membership intact.
    removeMember(removal: MemberRemoval): Promise<void>;
}
