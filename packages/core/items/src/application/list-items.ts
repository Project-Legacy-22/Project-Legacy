import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export function makeListItems(repository: ItemRepository) {
    return async function listItems(): Promise<Item[]> {
        return repository.findAll();
    };
}
