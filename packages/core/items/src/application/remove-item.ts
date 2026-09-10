import { ItemNotFound } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export function makeRemoveItem(repository: ItemRepository) {
    return async function removeItem(id: string, projectId: string, memberId: string): Promise<void> {
        // Same silence as changeItem, for the same reason.
        const existing = await repository.findByIdForMember(id, projectId, memberId);
        if (!existing) {
            throw new ItemNotFound(id);
        }

        await repository.remove(id);
    };
}
