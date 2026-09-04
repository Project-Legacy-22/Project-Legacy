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
    onRemove: (item: ItemDto) => Promise<boolean>;
    onLoadMore: () => void;
    onRetry: () => void;
}

export function ItemsContent({
    items,
    loadState,
    pendingItemIds,
    hasNextPage,
    paginationState,
    onToggle,
    onRemove,
    onLoadMore,
    onRetry,
}: ItemsContentProps) {
    const handleRetry = () => {
        onRetry();
        document.querySelector<HTMLElement>('#items-heading')?.focus();
    };

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
                <button className="button button-secondary" type="button" onClick={handleRetry}>
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
