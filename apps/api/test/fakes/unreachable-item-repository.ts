import type { ItemRepository } from '@legacy/core-items';

// Every method fails. A suite that mounts it is asserting that a request never
// reached the data layer at all: if the session guard let one through, the
// response would be a 500 carrying this message instead of the expected refusal.
function unreachable(): Promise<never> {
    return Promise.reject(new Error('the repository must not be reached without a session'));
}

export function unreachableItemRepository(): ItemRepository {
    return {
        findPageByOwner: unreachable,
        findByIdForOwner: unreachable,
        save: unreachable,
        update: unreachable,
        remove: unreachable,
    };
}
