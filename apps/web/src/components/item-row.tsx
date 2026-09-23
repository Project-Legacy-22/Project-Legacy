import { useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent, RefObject } from 'react';
import type { UpdateItemBody } from '@legacy/contracts';

import type { ItemDto, ItemStatus } from '../api/items-api';
import { labels } from '../labels';
import { formatDueDate, isOverdue } from '../item-due-date';
import { EditItemForm } from './edit-item-form';
import { MoveItemForm } from './move-item-form';

export interface ItemRowProps {
    item: ItemDto;
    isPending: boolean;
    onMove: (status: ItemStatus) => Promise<boolean>;
    upTarget: ItemDto | null;
    downTarget: ItemDto | null;
    onReorder: (target: ItemDto, direction: 'up' | 'down') => Promise<boolean>;
    onUpdate: (item: ItemDto, changes: UpdateItemBody) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onDragStart: (item: ItemDto, event: DragEvent<HTMLLIElement>) => void;
    onDragEnd: () => void;
}

interface ItemActionsProps {
    item: ItemDto;
    name: string;
    isPending: boolean;
    editButtonRef: RefObject<HTMLButtonElement | null>;
    moveButtonRef: RefObject<HTMLButtonElement | null>;
    removeButtonRef: RefObject<HTMLButtonElement | null>;
    onEdit: () => void;
    onMove: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onReorderUp: () => void;
    onReorderDown: () => void;
    onRemove: () => void;
}

function focusTargetAfterRemoval(button: HTMLButtonElement | null): HTMLElement | null {
    const row = button?.closest('li');
    return (
        row?.nextElementSibling?.querySelector<HTMLButtonElement>('.item-move:not(:disabled)') ??
        row?.previousElementSibling?.querySelector<HTMLButtonElement>('.item-move:not(:disabled)') ??
        document.querySelector<HTMLInputElement>('#item-name')
    );
}

function ReorderButtons(props: ItemActionsProps) {
    return (
        <>
            <button
                className="button button-secondary"
                type="button"
                aria-label={labels.reorderItem(props.name, labels.reorderUp)}
                disabled={props.isPending || !props.canMoveUp}
                onClick={props.onReorderUp}
            >
                {labels.reorderUp}
            </button>
            <button
                className="button button-secondary"
                type="button"
                aria-label={labels.reorderItem(props.name, labels.reorderDown)}
                disabled={props.isPending || !props.canMoveDown}
                onClick={props.onReorderDown}
            >
                {labels.reorderDown}
            </button>
        </>
    );
}

function ItemActions(props: ItemActionsProps) {
    return (
        <div className="item-actions">
            <ReorderButtons {...props} />
            <button
                ref={props.moveButtonRef}
                className="button button-secondary item-move"
                type="button"
                data-move-item-id={props.item.id}
                aria-label={labels.moveItem(props.name)}
                disabled={props.isPending || props.item.name === null}
                onClick={props.onMove}
            >
                {labels.move}
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

interface ItemRowBodyProps {
    item: ItemDto;
    name: string;
    mode: 'idle' | 'edit' | 'move';
    isPending: boolean;
    editButtonRef: RefObject<HTMLButtonElement | null>;
    moveButtonRef: RefObject<HTMLButtonElement | null>;
    removeButtonRef: RefObject<HTMLButtonElement | null>;
    onCancelEdit: () => void;
    onCancelMove: () => void;
    onEdit: () => void;
    onMove: (status: ItemStatus) => Promise<boolean>;
    upTarget: ItemDto | null;
    downTarget: ItemDto | null;
    onReorder: (target: ItemDto, direction: 'up' | 'down') => Promise<boolean>;
    onOpenMove: () => void;
    onRemove: () => void;
    onUpdate: (changes: UpdateItemBody) => Promise<boolean>;
}

type RestoredAction = 'edit' | 'move';

function useActionFocus(mode: ItemRowBodyProps['mode']) {
    const editButtonRef = useRef<HTMLButtonElement>(null);
    const moveButtonRef = useRef<HTMLButtonElement>(null);
    const pendingAction = useRef<RestoredAction | null>(null);

    useLayoutEffect(() => {
        if (mode !== 'idle' || pendingAction.current === null) return;
        const target = pendingAction.current === 'edit' ? editButtonRef : moveButtonRef;
        pendingAction.current = null;
        target.current?.focus();
    }, [mode]);

    return { editButtonRef, moveButtonRef, pendingAction };
}

function ItemPlanningSummary({ item }: { item: ItemDto }) {
    const hasOverdueDate = item.dueDate !== null && item.status !== 'done' && isOverdue(item.dueDate);

    return (
        <p className="item-planning-summary">
            <span className={`item-priority item-priority-${item.priority}`}>
                {labels.itemPriorityDescription(item.priority)}
            </span>
            {item.dueDate !== null && (
                <>
                    <span aria-hidden="true"> · </span>
                    <time dateTime={item.dueDate}>{labels.itemDueDate(formatDueDate(item.dueDate))}</time>
                    {hasOverdueDate && <span className="item-overdue">{labels.itemOverdue}</span>}
                </>
            )}
        </p>
    );
}

function ItemCopy({ item, name }: { item: ItemDto; name: string }) {
    return (
        <div className="item-copy">
            <p className="item-name">{name}</p>
            <p className="item-state">{labels.itemStatus(item.status)}</p>
            <ItemPlanningSummary item={item} />
            {item.name === null && (
                <p className="item-remediation">{labels.unnamedItemRemediation}</p>
            )}
        </div>
    );
}

function ItemRowBody(props: ItemRowBodyProps) {
    if (props.mode === 'edit') {
        return (
            <EditItemForm
                itemId={props.item.id}
                initialName={props.item.name ?? ''}
                initialPriority={props.item.priority}
                initialDueDate={props.item.dueDate}
                isPending={props.isPending}
                onCancel={props.onCancelEdit}
                onSave={props.onUpdate}
            />
        );
    }

    if (props.mode === 'move') {
        return (
            <MoveItemForm
                currentStatus={props.item.status}
                isPending={props.isPending}
                itemName={props.name}
                onCancel={props.onCancelMove}
                onMove={props.onMove}
            />
        );
    }

    return (
        <>
            <ItemCopy item={props.item} name={props.name} />
            <ItemActions
                item={props.item}
                name={props.name}
                isPending={props.isPending}
                editButtonRef={props.editButtonRef}
                moveButtonRef={props.moveButtonRef}
                removeButtonRef={props.removeButtonRef}
                onEdit={props.onEdit}
                onMove={props.onOpenMove}
                canMoveUp={props.upTarget !== null}
                canMoveDown={props.downTarget !== null}
                onReorderUp={() => {
                    if (props.upTarget !== null) void props.onReorder(props.upTarget, 'up');
                }}
                onReorderDown={() => {
                    if (props.downTarget !== null) void props.onReorder(props.downTarget, 'down');
                }}
                onRemove={props.onRemove}
            />
        </>
    );
}

export function ItemRow(props: ItemRowProps) {
    const [mode, setMode] = useState<'idle' | 'edit' | 'move'>('idle');
    const { editButtonRef, moveButtonRef, pendingAction } = useActionFocus(mode);
    const removeButtonRef = useRef<HTMLButtonElement>(null);
    const name = props.item.name ?? labels.unnamedItem;

    const handleRemove = async () => {
        if (!globalThis.confirm(labels.confirmItemRemoval(name))) return;
        const focusTarget = focusTargetAfterRemoval(removeButtonRef.current);
        if (await props.onRemove(props.item)) globalThis.setTimeout(() => focusTarget?.focus(), 0);
    };

    const close = (target: RestoredAction) => {
        pendingAction.current = target;
        setMode('idle');
    };

    const handleUpdate = async (changes: UpdateItemBody) => {
        const saved = await props.onUpdate(props.item, changes);
        if (saved) close('edit');
        return saved;
    };

    return (
        <li
            className={`todo-item todo-item-${props.item.status}`}
            draggable={!props.isPending && props.item.name !== null}
            aria-busy={props.isPending}
            onDragStart={(event) => props.onDragStart(props.item, event)}
            onDragEnd={props.onDragEnd}
        >
            <ItemRowBody
                item={props.item}
                name={name}
                mode={mode}
                isPending={props.isPending}
                editButtonRef={editButtonRef}
                moveButtonRef={moveButtonRef}
                removeButtonRef={removeButtonRef}
                onCancelEdit={() => close('edit')}
                onCancelMove={() => close('move')}
                onEdit={() => setMode('edit')}
                onMove={props.onMove}
                upTarget={props.upTarget}
                downTarget={props.downTarget}
                onReorder={props.onReorder}
                onOpenMove={() => setMode('move')}
                onRemove={() => void handleRemove()}
                onUpdate={handleUpdate}
            />
        </li>
    );
}
