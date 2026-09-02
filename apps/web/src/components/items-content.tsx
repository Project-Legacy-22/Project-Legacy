import type { ItemDto } from '../api/items-api';
import { labels } from '../labels';
import type { ItemsLoadState } from '../hooks/use-items';
import { ItemRow } from './item-row';

export interface ItemsContentProps {
    items: readonly ItemDto[];
    loadState: ItemsLoadState;
    pendingItemIds: ReadonlySet<string>;
    onToggle: (item: ItemDto) => Promise<void>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onRetry: () => void;
}

export function ItemsContent({
    items,
    loadState,
    pendingItemIds,
    onToggle,
    onRemove,
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
        <ul className="todo-list">
            {items.map(item => (
                <ItemRow
                    key={item.id}
                    item={item}
                    isPending={pendingItemIds.has(item.id)}
                    onToggle={onToggle}
                    onRemove={onRemove}
                />
            ))}
        </ul>
    );
}
