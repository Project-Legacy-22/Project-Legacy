import { createItem } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

// The identifier generator is injected rather than imported: a use case that
// calls a uuid library directly cannot be tested deterministically.
export interface AddItemDependencies {
    repository: ItemRepository;
    newId: () => string;
}

// The owner is an argument, not an injected constant: since US-11 it is the
// authenticated caller, which changes with every request. The use case still
// has no business knowing where that identity comes from.
export function makeAddItem({ repository, newId }: AddItemDependencies) {
    return async function addItem(name: string, ownerId: string): Promise<Item> {
        const item = createItem(newId(), name, ownerId);

        await repository.save(item);

        return item;
    };
}
