import { createItem } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

// The identifier generator is injected rather than imported: a use case that
// calls a uuid library directly cannot be tested deterministically. The owner
// is injected for the same reason and because the use case has no business
// knowing where "the current user" comes from -- today a constant, tomorrow the
// authenticated session (US-11).
export interface AddItemDependencies {
    repository: ItemRepository;
    newId: () => string;
    ownerId: () => string;
}

export function makeAddItem({ repository, newId, ownerId }: AddItemDependencies) {
    return async function addItem(name: string): Promise<Item> {
        const item = createItem(newId(), name, ownerId());

        await repository.save(item);

        return item;
    };
}
