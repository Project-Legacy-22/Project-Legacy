import type { ItemDto, ItemStatus } from '../api/items-api';
import type { UpdateItemBody } from '@legacy/contracts';
import { labels } from '../labels';
import type { ItemsLoadState, ItemsPaginationState } from '../hooks/use-items';
import { KanbanBoard } from './kanban-board';
import { ItemsPagination } from './items-pagination';

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
    document.querySelector<HTMLElement>('#items-heading')?.focus();
}

function LoadingItems() {
    return (
        <p className="status-message" role="status">
            {labels.loadingItems}
        </p>
    );
}

function ItemsError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="error-message" role="alert">
            <p>{message}</p>
            <button className="button button-secondary" type="button" onClick={() => retryItems(onRetry)}>
                {labels.retry}
            </button>
        </div>
    );
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
    if (loadState.status === 'loading' && items.length === 0) return <LoadingItems />;

    if (loadState.status === 'error') {
        return <ItemsError message={loadState.message} onRetry={onRetry} />;
    }

    return (
        <>
            {loadState.status === 'loading' && <LoadingItems />}
            {items.length === 0 && <p className="empty-message">{labels.emptyItems}</p>}
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
        </>
    );
}
