import { useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { ItemDto } from '../api/items-api';
import { labels } from '../labels';
import { EditItemForm } from './edit-item-form';

export interface ItemRowProps {
    item: ItemDto;
    isPending: boolean;
    onToggle: (item: ItemDto) => Promise<void>;
    onRename: (item: ItemDto, name: string) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
}

interface ItemActionsProps {
    item: ItemDto;
    name: string;
    isPending: boolean;
    editButtonRef: RefObject<HTMLButtonElement | null>;
    removeButtonRef: RefObject<HTMLButtonElement | null>;
    onToggle: () => void;
    onEdit: () => void;
    onRemove: () => void;
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

function ItemActions(props: ItemActionsProps) {
    const toggleLabel = props.item.completed ? labels.reopen : labels.complete;

    return (
        <div className="item-actions">
            <button
                className="button button-secondary item-toggle"
                type="button"
                aria-label={toggleAriaLabel(props.item, props.name)}
                aria-pressed={props.item.completed}
                disabled={props.isPending || props.item.name === null}
                onClick={props.onToggle}
            >
                {toggleLabel}
            </button>
            <button
                ref={props.editButtonRef}
                className="button button-secondary item-edit"
                type="button"
                aria-label={labels.editItem(props.name)}
                disabled={props.isPending}
                onClick={props.onEdit}
            >
                {labels.edit}
            </button>
            <button
                ref={props.removeButtonRef}
                className="button button-danger item-remove"
                type="button"
                aria-label={labels.removeItem(props.name)}
                disabled={props.isPending}
                onClick={props.onRemove}
            >
                {labels.remove}
            </button>
        </div>
    );
}

export function ItemRow({ item, isPending, onToggle, onRename, onRemove }: ItemRowProps) {
    const [isEditing, setIsEditing] = useState(false);
    const editButtonRef = useRef<HTMLButtonElement>(null);
    const removeButtonRef = useRef<HTMLButtonElement>(null);
    const name = item.name ?? labels.unnamedItem;

    const handleRemove = async () => {
        if (!globalThis.confirm(labels.confirmItemRemoval(name))) return;
        const focusTarget = focusTargetAfterRemoval(removeButtonRef.current);

        if (await onRemove(item)) globalThis.setTimeout(() => focusTarget?.focus(), 0);
    };

    const closeEditor = () => {
        setIsEditing(false);
        globalThis.setTimeout(() => editButtonRef.current?.focus(), 0);
    };

    const handleRename = async (newName: string) => {
        const saved = await onRename(item, newName);
        if (saved) closeEditor();
        return saved;
    };

    return (
        <li className={`todo-item${item.completed ? ' todo-item-completed' : ''}`}>
            {isEditing ? (
                <EditItemForm
                    itemId={item.id}
                    initialName={item.name ?? ''}
                    isPending={isPending}
                    onCancel={closeEditor}
                    onSave={handleRename}
                />
            ) : (
                <>
                    <div className="item-copy">
                        <p className="item-name">{name}</p>
                        <p className="item-state">{itemState(item)}</p>
                    </div>
                    <ItemActions
                        item={item}
                        name={name}
                        isPending={isPending}
                        editButtonRef={editButtonRef}
                        removeButtonRef={removeButtonRef}
                        onToggle={() => void onToggle(item)}
                        onEdit={() => setIsEditing(true)}
                        onRemove={() => void handleRemove()}
                    />
                </>
            )}
        </li>
    );
}
