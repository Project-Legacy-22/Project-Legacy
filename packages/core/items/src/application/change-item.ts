import { itemName, ItemNotFound } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface ItemChanges {
    name: string;
    completed: boolean;
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
            id: existing.id,
            name: itemName(request.changes.name),
            completed: request.changes.completed,
            projectId: existing.projectId,
            ownerId: existing.ownerId,
        };

        await repository.update(updated);

        return updated;
    };
}
