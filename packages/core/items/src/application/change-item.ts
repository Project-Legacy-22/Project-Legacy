import { itemName, ItemNotFound } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface ItemChanges {
    name: string;
}

export interface ChangeItemRequest {
    id: string;
    projectId: string;
    memberId: string;
    changes: ItemChanges;
}

export function makeChangeItem(repository: ItemRepository) {
    return async function changeItem(request: ChangeItemRequest): Promise<Item> {
        const existing = await repository.findByIdForMember(request.id, request.projectId, request.memberId);
        // Someone else's item is reported like one that never existed: a 403
        // would confirm the identifier designates a real item (US-12).
        if (!existing) {
            throw new ItemNotFound(request.id);
        }

        const updated: Item = {
            ...existing,
            name: itemName(request.changes.name),
            version: existing.version + 1,
        };

        await repository.update(updated);

        return updated;
    };
}
