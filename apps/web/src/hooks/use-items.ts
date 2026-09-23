import type { ItemsApi } from '../api/items-api';
import type { CreateItemBody } from '@legacy/contracts';
import type { AddItemResult, ItemActionFeedback, ItemsLoadState, ItemsPaginationState } from './items-state';
import type { ItemsFilterValues } from './use-items-filters';
import { useItemActions } from './use-item-actions';
import { useItemsFilters } from './use-items-filters';
import { useItemsQuery } from './use-items-query';

export type { AddItemResult, ItemActionFeedback, ItemsLoadState, ItemsPaginationState } from './items-state';
export type { ItemsFilterValues } from './use-items-filters';

export interface ItemsState {
    items: ReturnType<typeof useItemsQuery>['items'];
    loadState: ItemsLoadState;
    feedback: ItemActionFeedback;
    isAdding: boolean;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    filterValues: ItemsFilterValues;
    hasActiveFilters: boolean;
    addItem: (body: CreateItemBody) => Promise<AddItemResult>;
    moveItem: ReturnType<typeof useItemActions>['moveItem'];
    reorderItem: ReturnType<typeof useItemActions>['reorderItem'];
    updateItem: ReturnType<typeof useItemActions>['updateItem'];
    removeItem: ReturnType<typeof useItemActions>['removeItem'];
    loadMore: () => void;
    retry: () => void;
    onSearchChange: (search: string) => void;
    onStatusChange: ReturnType<typeof useItemsFilters>['setStatus'];
    onPriorityChange: ReturnType<typeof useItemsFilters>['setPriority'];
    onDueDateChange: (dueDate: string) => void;
    onNoDueDateChange: (noDueDate: boolean) => void;
    onClearFilters: () => void;
}

export function useItems(api: ItemsApi, projectId: string | null): ItemsState {
    const itemsFilters = useItemsFilters();
    const query = useItemsQuery(api, projectId, itemsFilters.filters);
    const actions = useItemActions({ api, projectId, setItems: query.setItems, refreshItems: query.refresh });

    return {
        items: query.items,
        loadState: query.loadState,
        feedback: actions.feedback,
        isAdding: actions.isAdding,
        pendingItemIds: actions.pendingItemIds,
        hasNextPage: query.hasNextPage,
        paginationState: query.paginationState,
        filterValues: itemsFilters.values,
        hasActiveFilters: itemsFilters.hasActiveFilters,
        addItem: actions.addItem,
        moveItem: actions.moveItem,
        reorderItem: actions.reorderItem,
        updateItem: actions.updateItem,
        removeItem: actions.removeItem,
        loadMore: () => {
            void query.loadMore();
        },
        retry: query.retry,
        onSearchChange: itemsFilters.setSearch,
        onStatusChange: itemsFilters.setStatus,
        onPriorityChange: itemsFilters.setPriority,
        onDueDateChange: itemsFilters.setDueDate,
        onNoDueDateChange: itemsFilters.setNoDueDate,
        onClearFilters: itemsFilters.clearAll,
    };
}
