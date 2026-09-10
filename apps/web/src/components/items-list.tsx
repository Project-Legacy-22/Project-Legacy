import type { ItemDto } from '../api/items-api';
import { ItemRow } from './item-row';

export interface ItemsListProps {
    items: readonly ItemDto[];
    pendingItemIds: ReadonlySet<string>;
    onToggle: (item: ItemDto) => Promise<void>;
    onRename: (item: ItemDto, name: string) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
}

export function ItemsList({ items, pendingItemIds, onToggle, onRename, onRemove }: ItemsListProps) {
    return (
        <ul id="items-list" className="todo-list">
            {items.map(item => (
                <ItemRow
                    key={item.id}
                    item={item}
                    isPending={pendingItemIds.has(item.id)}
                    onToggle={onToggle}
                    onRename={onRename}
                    onRemove={onRemove}
                />
            ))}
        </ul>
    );
}
