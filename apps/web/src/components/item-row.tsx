import { useRef } from 'react';

import type { ItemDto } from '../api/items-api';
import { labels } from '../labels';

export interface ItemRowProps {
    item: ItemDto;
    isPending: boolean;
    onToggle: (item: ItemDto) => Promise<void>;
    onRemove: (item: ItemDto) => Promise<boolean>;
}

function toggleAriaLabel(item: ItemDto, name: string): string {
    if (item.name === null) return labels.unavailableForUnnamedItem;
    return item.completed ? labels.reopenItem(name) : labels.completeItem(name);
}

function itemState(item: ItemDto): string {
    if (item.name === null) return labels.unnamedItemRemediation;
    return item.completed ? labels.completed : labels.open;
}

function focusTargetAfterRemoval(button: HTMLButtonElement | null): HTMLElement | null {
    const row = button?.closest('li');
    return (
        row?.nextElementSibling?.querySelector<HTMLButtonElement>('button') ??
        row?.previousElementSibling?.querySelector<HTMLButtonElement>('button') ??
        document.querySelector<HTMLInputElement>('#item-name')
    );
}

export function ItemRow({ item, isPending, onToggle, onRemove }: ItemRowProps) {
    const removeButtonRef = useRef<HTMLButtonElement>(null);
    const name = item.name ?? labels.unnamedItem;
    const canToggle = item.name !== null;
    const toggleLabel = item.completed ? labels.reopen : labels.complete;

    const handleRemove = async () => {
        const focusTarget = focusTargetAfterRemoval(removeButtonRef.current);

        if (await onRemove(item)) globalThis.setTimeout(() => focusTarget?.focus(), 0);
    };

    return (
        <li className={`todo-item${item.completed ? ' todo-item-completed' : ''}`}>
            <div className="item-copy">
                <p className="item-name">{name}</p>
                <p className="item-state">{itemState(item)}</p>
            </div>
            <div className="item-actions">
                <button
                    className="button button-secondary"
                    type="button"
                    aria-label={toggleAriaLabel(item, name)}
                    aria-pressed={item.completed}
                    disabled={isPending || !canToggle}
                    onClick={() => void onToggle(item)}
                >
                    {toggleLabel}
                </button>
                <button
                    ref={removeButtonRef}
                    className="button button-danger"
                    type="button"
                    aria-label={labels.removeItem(name)}
                    disabled={isPending}
                    onClick={() => void handleRemove()}
                >
                    {labels.remove}
                </button>
            </div>
        </li>
    );
}
