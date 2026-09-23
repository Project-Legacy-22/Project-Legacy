import type { ItemStatus } from '@legacy/contracts';

const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
    todo: 'Todo',
    doing: 'In progress',
    done: 'Done',
};

export const itemStatusLabels = {
    emptyColumn(status: ItemStatus): string {
        return `No tasks in ${ITEM_STATUS_LABELS[status]}.`;
    },
    itemStatus(status: ItemStatus): string {
        return ITEM_STATUS_LABELS[status];
    },
} as const;
