import { itemDueDate, itemName, ItemNotFound } from '../domain/item.js';
import { checkedAssignees } from './assignees.js';
import type { Item, ItemPriority } from '../domain/item.js';
import type { ItemRepository } from '../ports/item-repository.js';

export interface ItemChanges {
    name: string;
    priority?: ItemPriority | undefined;
    dueDate?: string | null | undefined;
    // Absent leaves the assignees as they are; an empty list unassigns.
    assigneeIds?: readonly string[] | undefined;
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
            priority: request.changes.priority ?? existing.priority,
            dueDate: request.changes.dueDate === undefined ? existing.dueDate : itemDueDate(request.changes.dueDate),
            // Checked here so the refusal is a clear 404. The database checks
            // it again, against a member removed in between.
            assigneeIds: request.changes.assigneeIds === undefined
                ? existing.assigneeIds
                : await checkedAssignees(repository, existing.projectId, request.changes.assigneeIds),
            version: existing.version + 1,
        };

        await repository.update(updated);

        return updated;
    };
}
