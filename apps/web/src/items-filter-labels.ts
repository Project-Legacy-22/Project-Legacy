export const itemsFilterLabels = {
    itemsFound(count: number): string {
        return `${count} ${count === 1 ? 'task' : 'tasks'} found.`;
    },
    filtersLabel: 'Search and filter tasks',
    searchLabel: 'Search by name',
    searchHelp: 'Not case- or accent-sensitive.',
    statusFilterLabel: 'Status',
    priorityFilterLabel: 'Priority',
    dueDateFilterLabel: 'Due date',
    allStatuses: 'Any status',
    allPriorities: 'Any priority',
    noDueDateFilter: 'No due date only',
    clearFilters: 'Clear filters',
    noSearchResults: 'No task matches your search or filters.',
} as const;
