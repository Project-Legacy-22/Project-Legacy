import { useLayoutEffect, useState } from 'react';
import type { DragEvent } from 'react';

import type { ItemDto, ItemStatus } from '../api/items-api';
import type { UpdateItemBody } from '@legacy/contracts';
import { labels } from '../labels';
import { ItemRow } from './item-row';

const COLUMNS: readonly ItemStatus[] = ['todo', 'doing', 'done'];

export interface KanbanBoardProps {
    items: readonly ItemDto[];
    isDisabled: boolean;
    pendingItemIds: ReadonlySet<string>;
    onMove: (item: ItemDto, status: ItemStatus) => Promise<boolean>;
    onUpdate: (item: ItemDto, changes: UpdateItemBody) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
}

interface KanbanColumnProps extends KanbanBoardProps {
    status: ItemStatus;
    isDropTarget: boolean;
    onDragEnter: (status: ItemStatus) => void;
    onDragEnd: () => void;
    onDragStart: (item: ItemDto, event: DragEvent<HTMLLIElement>) => void;
    onDrop: (status: ItemStatus, event: DragEvent<HTMLElement>) => void;
}

function KanbanColumn(props: KanbanColumnProps) {
    const items = props.items.filter((item) => item.status === props.status);
    const headingId = `kanban-column-${props.status}`;
    const className = `kanban-column${props.isDropTarget ? ' kanban-column-drop-target' : ''}`;

    return (
        <section
            className={className}
            data-kanban-status={props.status}
            aria-labelledby={headingId}
            aria-busy={items.some((item) => props.pendingItemIds.has(item.id))}
            onDragEnter={() => props.onDragEnter(props.status)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => props.onDrop(props.status, event)}
        >
            <div className="kanban-column-heading">
                <h3 id={headingId}>{labels.itemStatus(props.status)}</h3>
                <span className="kanban-count" aria-label={labels.columnItemCount(items.length)}>
                    {items.length}
                </span>
            </div>
            {items.length === 0 ? (
                <p className="kanban-empty">{labels.emptyColumn(props.status)}</p>
            ) : (
                <ul className="todo-list">
                    {items.map((item) => (
                        <ItemRow
                            key={item.id}
                            item={item}
                            isPending={props.isDisabled || props.pendingItemIds.has(item.id)}
                            onMove={(destination) => props.onMove(item, destination)}
                            onUpdate={props.onUpdate}
                            onRemove={props.onRemove}
                            onDragStart={props.onDragStart}
                            onDragEnd={props.onDragEnd}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function useFocusedMove(items: readonly ItemDto[], onMove: KanbanBoardProps['onMove']) {
    const [request, setRequest] = useState<{ itemId: string } | null>(null);

    useLayoutEffect(() => {
        if (request === null) return;
        document.querySelector<HTMLButtonElement>(`[data-move-item-id="${request.itemId}"]`)?.focus();
    }, [items, request]);

    return async (item: ItemDto, status: ItemStatus) => {
        const moved = await onMove(item, status);
        setRequest({ itemId: item.id });
        return moved;
    };
}

export function KanbanBoard(props: KanbanBoardProps) {
    const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<ItemStatus | null>(null);
    const moveWithFocus = useFocusedMove(props.items, props.onMove);
    const draggedItem = props.items.find((item) => item.id === draggedItemId);

    const finishDrag = () => {
        setDraggedItemId(null);
        setDropTarget(null);
    };

    const startDrag = (item: ItemDto, event: DragEvent<HTMLLIElement>) => {
        setDraggedItemId(item.id);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', item.id);
    };

    const drop = (status: ItemStatus, event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        const item = draggedItem;
        finishDrag();
        if (item === undefined || item.status === status || props.isDisabled) return;
        void props.onMove(item, status);
    };

    return (
        <div className="kanban-region">
            <p id="kanban-instructions" className="kanban-instructions">
                {labels.kanbanInstructions}
            </p>
            <div id="items-list" className="kanban-board" aria-describedby="kanban-instructions">
                {COLUMNS.map((status) => (
                    <KanbanColumn
                        key={status}
                        {...props}
                        onMove={moveWithFocus}
                        status={status}
                        isDropTarget={dropTarget === status && draggedItem?.status !== status}
                        onDragEnter={(target) => {
                            if (draggedItem !== undefined && !props.isDisabled) setDropTarget(target);
                        }}
                        onDragStart={startDrag}
                        onDragEnd={finishDrag}
                        onDrop={drop}
                    />
                ))}
            </div>
        </div>
    );
}
