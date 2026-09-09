import type { ItemDto } from '../api/items-api';
import { labels } from '../labels';
import type { ItemsLoadState, ItemsPaginationState } from '../hooks/use-items';
import { ItemsList } from './items-list';
import { ItemsPagination } from './items-pagination';

export interface ItemsContentProps {
    items: readonly ItemDto[];
    loadState: ItemsLoadState;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    onToggle: (item: ItemDto) => Promise<void>;
    onRename: (item: ItemDto, name: string) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onLoadMore: () => void;
    onRetry: () => void;
}

function retryItems(onRetry: () => void): void {
    onRetry();
    document.querySelector<HTMLElement>('#items-heading')?.focus();
}

export function ItemsContent({
    items,
    loadState,
    pendingItemIds,
    hasNextPage,
    paginationState,
    onToggle,
    onRename,
    onRemove,
    onLoadMore,
    onRetry,
}: ItemsContentProps) {
    if (loadState.status === 'loading') {
        return (
            <p className="status-message" role="status">
                {labels.loadingItems}
            </p>
        );
    }

    if (loadState.status === 'error') {
        return (
            <div className="error-message" role="alert">
                <p>{loadState.message}</p>
                <button className="button button-secondary" type="button" onClick={() => retryItems(onRetry)}>
                    {labels.retry}
                </button>
            </div>
        );
    }

    if (items.length === 0) return <p className="empty-message">{labels.emptyItems}</p>;

    return (
        <>
            <ItemsList
                items={items}
                pendingItemIds={pendingItemIds}
                onToggle={onToggle}
                onRename={onRename}
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
