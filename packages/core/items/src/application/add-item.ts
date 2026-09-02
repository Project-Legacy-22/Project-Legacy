import { createItem } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

// The identifier generator is injected rather than imported: a use case that
// calls a uuid library directly cannot be tested deterministically.
export interface AddItemDependencies {
    repository: ItemRepository;
    newId: () => string;
}

export function makeAddItem({ repository, newId }: AddItemDependencies) {
    return async function addItem(name: string): Promise<Item> {
        const item = createItem(newId(), name);

        await repository.save(item);

        return item;
    };
}
