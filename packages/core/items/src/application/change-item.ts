import { itemName, ItemNotFound } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface ItemChanges {
    name: string;
    completed: boolean;
}

export function makeChangeItem(repository: ItemRepository) {
    return async function changeItem(
        id: string,
        ownerId: string,
        changes: ItemChanges,
    ): Promise<Item> {
        const existing = await repository.findByIdForOwner(id, ownerId);
        // Someone else's item is reported like one that never existed: a 403
        // would confirm the identifier designates a real item (US-12).
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
