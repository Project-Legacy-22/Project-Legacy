import { createItem } from '../domain/item.js';
import { itemCreated } from '../domain/event.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

// The identifier generator is injected rather than imported: a use case that
// calls a uuid library directly cannot be tested deterministically. The owner
// is injected for the same reason and because the use case has no business
// knowing where "the current user" comes from -- today a constant, tomorrow the
// authenticated session (US-11). The clock is injected on the same grounds: the
// event carries the instant the fact happened.
export interface AddItemDependencies {
    repository: ItemRepository;
    newId: () => string;
    ownerId: () => string;
    now: () => Date;
}

export function makeAddItem({ repository, newId, ownerId, now }: AddItemDependencies) {
    return async function addItem(name: string): Promise<Item> {
        const item = createItem(newId(), name, ownerId());
        const event = itemCreated(newId(), now(), item);

        // One call, so the item and its event share a transaction. Announcing
        // the creation afterwards would leave a window where a failure publishes
        // an event for an item that was never written.
        await repository.save(item, event);

        return item;
    };
}
