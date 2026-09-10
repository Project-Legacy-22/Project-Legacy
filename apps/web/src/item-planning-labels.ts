import type { ItemPriority } from '@legacy/contracts';

const ITEM_PRIORITY_LABELS: Record<ItemPriority, string> = {
    low: 'Low',
    normal: 'Normal',
    high: 'High',
};

export const itemPlanningLabels = {
    itemPriorityLabel: 'Priority',
    itemDueDateLabel: 'Due date',
    itemDueDateHelp: 'Optional. Past dates are accepted.',
    itemOverdue: 'Overdue',
    itemPriority(priority: ItemPriority): string {
        return ITEM_PRIORITY_LABELS[priority];
    },
    itemPriorityDescription(priority: ItemPriority): string {
        return `${ITEM_PRIORITY_LABELS[priority]} priority`;
    },
    itemDueDate(formattedDate: string): string {
        return `Due ${formattedDate}`;
    },
} as const;
