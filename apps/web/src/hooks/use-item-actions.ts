import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ItemDto, ItemsApi, ItemStatus } from '../api/items-api';
import { labels } from '../labels';
import type { AddItemResult, ItemActionFeedback } from './items-state';
import type { SetItems } from './use-items-query';

interface ActionContext {
    api: ItemsApi;
    projectId: string | null;
    setItems: SetItems;
    setFeedback: Dispatch<SetStateAction<ItemActionFeedback>>;
    setIsAdding: Dispatch<SetStateAction<boolean>>;
    setPendingItemIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
    refreshItems: () => Promise<boolean>;
}

function messageFor(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

function itemName(item: ItemDto): string {
    return item.name ?? labels.unnamedItem;
}

function updatePending(context: ActionContext, id: string, operation: 'add' | 'remove') {
    context.setPendingItemIds((current) => {
        const next = new Set(current);
        if (operation === 'add') next.add(id);
        else next.delete(id);
        return next;
    });
}

async function addItem(context: ActionContext, name: string): Promise<AddItemResult> {
    if (context.projectId === null) return { status: 'error', message: labels.selectProject };
    context.setIsAdding(true);
    context.setFeedback({ status: 'idle' });

    try {
        const created = await context.api.createItem(context.projectId, { name });
        context.setItems((current) => [...current, created]);
        context.setFeedback({
            status: 'success',
            message: labels.itemAdded(itemName(created)),
        });
        return { status: 'success' };
    } catch (error) {
        return {
            status: 'error',
            message: messageFor(error, labels.addItemFailed),
        };
    } finally {
        context.setIsAdding(false);
    }
}

async function renameItem(context: ActionContext, item: ItemDto, name: string): Promise<boolean> {
    if (context.projectId === null) return false;
    updatePending(context, item.id, 'add');
    context.setFeedback({ status: 'idle' });

    try {
        const updated = await context.api.updateItem(context.projectId, item.id, {
            name,
        });
        context.setItems((current) =>
            current.map((currentItem) => (currentItem.id === updated.id ? updated : currentItem)),
        );
        context.setFeedback({ status: 'success', message: labels.itemRenamed(itemName(updated)) });
        return true;
    } catch (error) {
        context.setFeedback({
            status: 'error',
            message: messageFor(error, labels.updateItemFailed),
        });
        return false;
    } finally {
        updatePending(context, item.id, 'remove');
    }
}

function replaceItem(items: readonly ItemDto[], replacement: ItemDto): readonly ItemDto[] {
    return items.map((item) => (item.id === replacement.id ? replacement : item));
}

async function recoverMove(context: ActionContext, item: ItemDto, error: unknown): Promise<void> {
    context.setItems((current) => replaceItem(current, item));

    if (error instanceof ApiError && error.status === 409) {
        const refreshed = await context.refreshItems();
        context.setFeedback({
            status: 'error',
            message: refreshed ? labels.itemMoveConflict : labels.itemMoveConflictRefreshFailed,
        });
        return;
    }

    context.setFeedback({
        status: 'error',
        message: labels.itemMoveFailed(itemName(item), labels.itemStatus(item.status)),
    });
}

async function moveItem(context: ActionContext, item: ItemDto, status: ItemStatus): Promise<boolean> {
    if (context.projectId === null || status === item.status) return false;
    updatePending(context, item.id, 'add');
    context.setFeedback({ status: 'idle' });
    context.setItems((current) => replaceItem(current, { ...item, status }));

    try {
        const updated = await context.api.moveItem(context.projectId, item.id, {
            status,
            version: item.version,
        });
        context.setItems((current) => replaceItem(current, updated));
        context.setFeedback({
            status: 'success',
            message: labels.itemMoved(itemName(updated), labels.itemStatus(updated.status)),
        });
        return true;
    } catch (error) {
        await recoverMove(context, item, error);
        return false;
    } finally {
        updatePending(context, item.id, 'remove');
    }
}

async function removeItem(context: ActionContext, item: ItemDto): Promise<boolean> {
    if (context.projectId === null) return false;
    updatePending(context, item.id, 'add');
    context.setFeedback({ status: 'idle' });

    try {
        await context.api.deleteItem(context.projectId, item.id);
        context.setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
        context.setFeedback({
            status: 'success',
            message: labels.itemRemoved(itemName(item)),
        });
        return true;
    } catch (error) {
        context.setFeedback({
            status: 'error',
            message: messageFor(error, labels.removeItemFailed),
        });
        return false;
    } finally {
        updatePending(context, item.id, 'remove');
    }
}

interface UseItemActionsOptions {
    api: ItemsApi;
    projectId: string | null;
    setItems: SetItems;
    refreshItems: () => Promise<boolean>;
}

export function useItemActions(options: UseItemActionsOptions) {
    const { api, projectId, setItems, refreshItems } = options;
    const [feedback, setFeedback] = useState<ItemActionFeedback>({
        status: 'idle',
    });
    const [isAdding, setIsAdding] = useState(false);
    const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(new Set());
    const context = useMemo(
        () => ({
            api,
            projectId,
            setItems,
            setFeedback,
            setIsAdding,
            setPendingItemIds,
            refreshItems,
        }),
        [api, projectId, refreshItems, setItems],
    );

    const add = useCallback((name: string) => addItem(context, name), [context]);
    const rename = useCallback((item: ItemDto, name: string) => renameItem(context, item, name), [context]);
    const move = useCallback((item: ItemDto, status: ItemStatus) => moveItem(context, item, status), [context]);
    const remove = useCallback((item: ItemDto) => removeItem(context, item), [context]);

    return {
        feedback,
        isAdding,
        pendingItemIds,
        addItem: add,
        renameItem: rename,
        moveItem: move,
        removeItem: remove,
    };
}
