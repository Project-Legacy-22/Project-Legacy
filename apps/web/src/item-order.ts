import type { ItemDto } from './api/items-api';

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export function compareItems(left: ItemDto, right: ItemDto): number {
    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priority !== 0) return priority;
    if (left.dueDate === null && right.dueDate !== null) return 1;
    if (left.dueDate !== null && right.dueDate === null) return -1;
    const dueDate = (left.dueDate ?? '').localeCompare(right.dueDate ?? '');
    return dueDate !== 0 ? dueDate : left.id.localeCompare(right.id);
}

export function orderItems(items: readonly ItemDto[]): readonly ItemDto[] {
    return [...items].sort(compareItems);
}
