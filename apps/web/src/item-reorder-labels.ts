export const itemReorderLabels = {
    reorderUp: 'Move up',
    reorderDown: 'Move down',
    reorderItem(name: string, direction: string): string {
        return `${direction}: ${name}`;
    },
    itemReordered(name: string, direction: string): string {
        return `${name} moved ${direction}.`;
    },
    itemReorderFailed: 'Unable to change the task order. The latest board has been loaded.',
    itemReorderConflict: 'This task changed elsewhere. The latest board has been loaded. Try again.',
} as const;
