import { ItemNotFound, ItemPositionConflict } from '../domain/item.js';
import type { Item } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface ReorderItemRequest {
    id: string;
    projectId: string;
    memberId: string;
    position: string;
    expectedVersion: number;
}

export function makeReorderItem(repository: ItemRepository) {
    return async function reorderItem(request: ReorderItemRequest): Promise<Item> {
        const existing = await repository.findByIdForMember(request.id, request.projectId, request.memberId);
        if (!existing) throw new ItemNotFound(request.id);
        if (existing.version !== request.expectedVersion) throw new ItemPositionConflict(request.id);

        const reordered = await repository.swapPosition(request);
        if (reordered) return reordered;

        const current = await repository.findByIdForMember(request.id, request.projectId, request.memberId);
        if (!current) throw new ItemNotFound(request.id);
        throw new ItemPositionConflict(request.id);
    };
}
