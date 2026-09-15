import type { ItemDto, ItemStatus } from '../api/items-api';
import type { UpdateItemBody } from '@legacy/contracts';
import { labels } from '../labels';
import type { ItemsLoadState, ItemsPaginationState } from '../hooks/use-items';
import { KanbanBoard } from './kanban-board';
import { ItemsPagination } from './items-pagination';
import { ViewState } from './view-state';

export interface ItemsContentProps {
    items: readonly ItemDto[];
    loadState: ItemsLoadState;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    onMove: (item: ItemDto, status: ItemStatus) => Promise<boolean>;
    onUpdate: (item: ItemDto, changes: UpdateItemBody) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onLoadMore: () => void;
    onRetry: () => void;
}

function retryItems(onRetry: () => void): void {
    onRetry();
    // The button that was focused is about to be replaced by the list, so the
    // focus has to land somewhere deliberate. The heading is the region the
    // person asked to see again, and it is the only focus move here: the state
    // changes below never take focus by themselves.
    document.querySelector<HTMLElement>('#items-heading')?.focus();
}

// Focusing the field is the action, not scrolling to it: somebody who cannot
// see the panel gets the caret where the task is typed.
function focusItemName(): void {
    document.querySelector<HTMLInputElement>('#item-name')?.focus();
}

export function ItemsContent({
    items,
    loadState,
    pendingItemIds,
    hasNextPage,
    paginationState,
    onMove,
    onUpdate,
    onRemove,
    onLoadMore,
    onRetry,
}: ItemsContentProps) {
    return (
        <ViewState
            state={loadState}
            loadingMessage={labels.loadingItems}
            empty={{
                isEmpty: items.length === 0,
                message: labels.emptyItems,
                action: { label: labels.addItem, onAction: focusItemName },
            }}
            onRetry={() => retryItems(onRetry)}
            keepsChildrenWhenEmpty
        >
            <KanbanBoard
                items={items}
                isDisabled={loadState.status !== 'ready'}
                pendingItemIds={pendingItemIds}
                onMove={onMove}
                onUpdate={onUpdate}
                onRemove={onRemove}
            />
            <ItemsPagination
                hasNextPage={hasNextPage}
                state={paginationState}
                onLoadMore={onLoadMore}
            />
        </ViewState>
    );
}
