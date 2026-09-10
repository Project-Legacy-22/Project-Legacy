import { ItemNotFound, ItemStatusConflict } from '../domain/item.js';
import type { Item, ItemStatus } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface MoveItemRequest {
    id: string;
    projectId: string;
    memberId: string;
    status: ItemStatus;
    expectedVersion: number;
}

export function makeMoveItem(repository: ItemRepository) {
    return async function moveItem(request: MoveItemRequest): Promise<Item> {
        const existing = await repository.findByIdForMember(request.id, request.projectId, request.memberId);
        if (!existing) throw new ItemNotFound(request.id);
        if (existing.version !== request.expectedVersion) throw new ItemStatusConflict(request.id);

        const moved = await repository.moveStatus({
            id: request.id,
            projectId: request.projectId,
            status: request.status,
            expectedVersion: request.expectedVersion,
        });
        if (moved) return moved;

        const current = await repository.findByIdForMember(request.id, request.projectId, request.memberId);
        if (!current) throw new ItemNotFound(request.id);
        throw new ItemStatusConflict(request.id);
    };
}
