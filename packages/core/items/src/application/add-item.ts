import { createItem } from '../domain/item.js';
import { itemCreated } from '../domain/event.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

// The identifier generator is injected rather than imported: a use case that
// calls a uuid library directly cannot be tested deterministically. The clock
// is injected on the same grounds, since the event carries the instant the fact
// happened.
export interface AddItemDependencies {
    repository: ItemRepository;
    newId: () => string;
    now: () => Date;
}

// The owner is an argument, not an injected constant: since US-11 it is the
// authenticated caller, which changes with every request. The use case still
// has no business knowing where that identity comes from.
export function makeAddItem({ repository, newId, now }: AddItemDependencies) {
    return async function addItem(name: string, ownerId: string): Promise<Item> {
        const item = createItem(newId(), name, ownerId);
        const event = itemCreated(newId(), now(), item);

        // One call, so the item and its event share a transaction. Announcing
        // the creation afterwards would leave a window where a failure publishes
        // an event for an item that was never written.
        await repository.save(item, event);

        return item;
    };
}
