import { ItemNotFound } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export function makeRemoveItem(repository: ItemRepository) {
    return async function removeItem(id: string): Promise<void> {
        const existing = await repository.findById(id);
        if (!existing) {
            throw new ItemNotFound(id);
        }

        await repository.remove(id);
    };
}
