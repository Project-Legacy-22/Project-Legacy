import { itemName, ItemNotFound } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface ItemChanges {
    name: string;
    completed: boolean;
}

export function makeChangeItem(repository: ItemRepository) {
    return async function changeItem(id: string, changes: ItemChanges): Promise<Item> {
        const existing = await repository.findById(id);
        if (!existing) {
            throw new ItemNotFound(id);
        }

        const updated: Item = {
            id: existing.id,
            name: itemName(changes.name),
            completed: changes.completed,
            ownerId: existing.ownerId,
        };

        await repository.update(updated);

        return updated;
    };
}
