import type { ItemPage, ItemPageQuery, ItemRepository } from '../ports/item-repository.js';

// The caller is an argument, like the owner of a new item: since US-12 the list
// is the caller's own items and nothing else.
export function makeListItems(repository: ItemRepository) {
    return async function listItems(ownerId: string, page: ItemPageQuery): Promise<ItemPage> {
        return repository.findPageByOwner(ownerId, page);
    };
}
