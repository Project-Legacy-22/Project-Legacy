import { AssigneeNotMember, itemDueDate, itemName, ItemNotFound } from '../domain/item.js';
import type { Item, ItemPriority } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface ItemChanges {
    name: string;
    priority?: ItemPriority | undefined;
    dueDate?: string | null | undefined;
    // Absent leaves the assignee as it is; null unassigns.
    assigneeId?: string | null | undefined;
}

export interface ChangeItemRequest {
    id: string;
    projectId: string;
    memberId: string;
    changes: ItemChanges;
}

async function assigneeOf(repository: ItemRepository, existing: Item, requested: string | null | undefined) {
    if (requested === undefined) return existing.assigneeId;
    if (requested !== null && !(await repository.isProjectMember(existing.projectId, requested))) {
        throw new AssigneeNotMember();
    }
    return requested;
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
            priority: request.changes.priority ?? existing.priority,
            dueDate: request.changes.dueDate === undefined ? existing.dueDate : itemDueDate(request.changes.dueDate),
            // Checked here so the refusal is a clear 404. The database checks
            // it again, against a member removed in between.
            assigneeId: await assigneeOf(repository, existing, request.changes.assigneeId),
            version: existing.version + 1,
        };

        await repository.update(updated);

        return updated;
    };
}
