export const labels = {
    skipToContent: 'Skip to content',
    productName: 'Legacy 22',
    pageTitle: 'Todo list',
    pageIntro: 'Keep the next useful action visible.',
    newItemKicker: 'New item',
    addSectionTitle: 'Add to the list',
    itemNameLabel: 'Item name',
    itemNameRequired: 'Enter an item name.',
    addingItem: 'Adding…',
    addItem: 'Add item',
    currentWorkKicker: 'Current work',
    itemsTitle: 'Items',
    loadingItems: 'Loading items…',
    retry: 'Try again',
    emptyItems: 'No items yet. Add one above.',
    unnamedItem: 'Unnamed item',
    unnamedItemRemediation: 'This legacy item has no name. Remove it and create it again.',
    unavailableForUnnamedItem: 'Completion unavailable: this legacy item has no name.',
    completed: 'Completed',
    open: 'Open',
    complete: 'Complete',
    reopen: 'Reopen',
    remove: 'Remove',
    invalidItem: 'The server returned an invalid item.',
    invalidItemList: 'The server returned an invalid item list.',
    unreadableResponse: 'The server returned an unreadable response.',
    loadItemsFailed: 'Unable to load the item list.',
    addItemFailed: 'Unable to add the item.',
    updateItemFailed: 'Unable to update the item.',
    removeItemFailed: 'Unable to remove the item.',
    requestFailed(status: number): string {
        return `The request failed with status ${status}.`;
    },
    itemNameHelp(maximumLength: number): string {
        return `Required. ${maximumLength} characters maximum.`;
    },
    itemNameTooLong(maximumLength: number): string {
        return `Enter no more than ${maximumLength} characters.`;
    },
    itemCount(count: number): string {
        return `${count} ${count === 1 ? 'item' : 'items'}`;
    },
    completeItem(name: string): string {
        return `Complete: ${name}`;
    },
    reopenItem(name: string): string {
        return `Reopen: ${name}`;
    },
    removeItem(name: string): string {
        return `Remove: ${name}`;
    },
    itemAdded(name: string): string {
        return `${name} added.`;
    },
    itemCompletionChanged(name: string, isCompleted: boolean): string {
        return `${name} marked as ${isCompleted ? 'completed' : 'open'}.`;
    },
    itemRemoved(name: string): string {
        return `${name} removed.`;
    },
} as const;
