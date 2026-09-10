import type { ItemsApi } from '../api/items-api';
import type { AddItemResult, ItemActionFeedback, ItemsLoadState, ItemsPaginationState } from './items-state';
import { useItemActions } from './use-item-actions';
import { useItemsQuery } from './use-items-query';

export type { AddItemResult, ItemActionFeedback, ItemsLoadState, ItemsPaginationState } from './items-state';

export interface ItemsState {
    items: ReturnType<typeof useItemsQuery>['items'];
    loadState: ItemsLoadState;
    feedback: ItemActionFeedback;
    isAdding: boolean;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    addItem: (name: string) => Promise<AddItemResult>;
    moveItem: ReturnType<typeof useItemActions>['moveItem'];
    renameItem: ReturnType<typeof useItemActions>['renameItem'];
    removeItem: ReturnType<typeof useItemActions>['removeItem'];
    loadMore: () => void;
    retry: () => void;
}

export function useItems(api: ItemsApi, projectId: string | null): ItemsState {
    const query = useItemsQuery(api, projectId);
    const actions = useItemActions({ api, projectId, setItems: query.setItems, refreshItems: query.refresh });

    return {
        items: query.items,
        loadState: query.loadState,
        feedback: actions.feedback,
        isAdding: actions.isAdding,
        pendingItemIds: actions.pendingItemIds,
        hasNextPage: query.hasNextPage,
        paginationState: query.paginationState,
        addItem: actions.addItem,
        moveItem: actions.moveItem,
        renameItem: actions.renameItem,
        removeItem: actions.removeItem,
        loadMore: () => {
            void query.loadMore();
        },
        retry: query.retry,
    };
}
