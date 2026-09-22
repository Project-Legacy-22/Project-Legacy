import { useCallback, useState } from 'react';
import type { ItemPriority, ItemStatus } from '@legacy/contracts';

import { useDebouncedValue } from './use-debounced-value';

// What the controls show and edit. '' means "no filter" for every field
// except dueDate, which also has the sentinel 'none' for "no due date" --
// a date input has no way to represent that itself, so a separate checkbox
// drives it (see items-filters.tsx).
export interface ItemsFilterValues {
    search: string;
    status: ItemStatus | '';
    priority: ItemPriority | '';
    dueDate: string;
}

// What the API accepts: an absent key, not an empty string, means no filter.
export interface ListItemsFilters {
    search?: string | undefined;
    status?: ItemStatus | undefined;
    priority?: ItemPriority | undefined;
    dueDate?: string | undefined;
}

const EMPTY_VALUES: ItemsFilterValues = { search: '', status: '', priority: '', dueDate: '' };

function toListItemsFilters(values: ItemsFilterValues, debouncedSearch: string): ListItemsFilters {
    return {
        search: debouncedSearch === '' ? undefined : debouncedSearch,
        status: values.status === '' ? undefined : values.status,
        priority: values.priority === '' ? undefined : values.priority,
        dueDate: values.dueDate === '' ? undefined : values.dueDate,
    };
}

export function useItemsFilters() {
    const [values, setValues] = useState<ItemsFilterValues>(EMPTY_VALUES);
    // Only the search field is debounced: a select or a date input already
    // fires once per deliberate choice, a text field fires once per keystroke.
    const debouncedSearch = useDebouncedValue(values.search, 300);
    const hasActiveFilters = values.search !== '' || values.status !== '' || values.priority !== '' || values.dueDate !== '';

    const setSearch = useCallback((search: string) => setValues((current) => ({ ...current, search })), []);
    const setStatus = useCallback((status: ItemStatus | '') => setValues((current) => ({ ...current, status })), []);
    const setPriority = useCallback((priority: ItemPriority | '') => setValues((current) => ({ ...current, priority })), []);
    const setDueDate = useCallback((dueDate: string) => setValues((current) => ({ ...current, dueDate })), []);
    const setNoDueDate = useCallback(
        (noDueDate: boolean) => setValues((current) => ({ ...current, dueDate: noDueDate ? 'none' : '' })),
        [],
    );
    // Every field at once, so the button the criteria are cleared through is
    // a single action, not one per field.
    const clearAll = useCallback(() => setValues(EMPTY_VALUES), []);

    return {
        values,
        filters: toListItemsFilters(values, debouncedSearch),
        hasActiveFilters,
        setSearch,
        setStatus,
        setPriority,
        setDueDate,
        setNoDueDate,
        clearAll,
    };
}
