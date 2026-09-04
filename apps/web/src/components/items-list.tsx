import type { ItemDto } from '../api/items-api';
import { ItemRow } from './item-row';

export interface ItemsListProps {
    items: readonly ItemDto[];
    pendingItemIds: ReadonlySet<string>;
    onToggle: (item: ItemDto) => Promise<void>;
    onRemove: (item: ItemDto) => Promise<boolean>;
}

export function ItemsList({ items, pendingItemIds, onToggle, onRemove }: ItemsListProps) {
    return (
        <ul id="items-list" className="todo-list">
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
