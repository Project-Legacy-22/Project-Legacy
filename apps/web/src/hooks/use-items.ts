import type { ItemsApi } from '../api/items-api';
import type { AddItemResult, ItemActionFeedback, ItemsLoadState } from './items-state';
import { useItemActions } from './use-item-actions';
import { useItemsQuery } from './use-items-query';

export type { AddItemResult, ItemActionFeedback, ItemsLoadState } from './items-state';

export interface ItemsState {
    items: ReturnType<typeof useItemsQuery>['items'];
    loadState: ItemsLoadState;
    feedback: ItemActionFeedback;
    isAdding: boolean;
    pendingItemIds: ReadonlySet<string>;
    addItem: (name: string) => Promise<AddItemResult>;
    toggleItem: ReturnType<typeof useItemActions>['toggleItem'];
    removeItem: ReturnType<typeof useItemActions>['removeItem'];
    retry: () => void;
}

export function useItems(api: ItemsApi): ItemsState {
    const query = useItemsQuery(api);
    const actions = useItemActions(api, query.setItems);

    return {
        items: query.items,
        loadState: query.loadState,
        feedback: actions.feedback,
        isAdding: actions.isAdding,
        pendingItemIds: actions.pendingItemIds,
        addItem: actions.addItem,
        toggleItem: actions.toggleItem,
        removeItem: actions.removeItem,
        retry: query.retry,
    };
}
