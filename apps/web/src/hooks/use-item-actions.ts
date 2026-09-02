import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ItemDto, ItemsApi } from '../api/items-api';
import { labels } from '../labels';
import type { AddItemResult, ItemActionFeedback } from './items-state';
import type { SetItems } from './use-items-query';

interface ActionContext {
    api: ItemsApi;
    setItems: SetItems;
    setFeedback: Dispatch<SetStateAction<ItemActionFeedback>>;
    setIsAdding: Dispatch<SetStateAction<boolean>>;
    setPendingItemIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}

function messageFor(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

function itemName(item: ItemDto): string {
    return item.name ?? labels.unnamedItem;
}

function updatePending(context: ActionContext, id: string, operation: 'add' | 'remove') {
    context.setPendingItemIds(current => {
        const next = new Set(current);
        if (operation === 'add') next.add(id);
        else next.delete(id);
        return next;
    });
}

async function addItem(context: ActionContext, name: string): Promise<AddItemResult> {
    context.setIsAdding(true);
    context.setFeedback({ status: 'idle' });

    try {
        const created = await context.api.createItem({ name });
        context.setItems(current => [...current, created]);
        context.setFeedback({ status: 'success', message: labels.itemAdded(itemName(created)) });
        return { status: 'success' };
    } catch (error) {
        return { status: 'error', message: messageFor(error, labels.addItemFailed) };
    } finally {
        context.setIsAdding(false);
    }
}

async function toggleItem(context: ActionContext, item: ItemDto): Promise<void> {
    if (item.name === null) {
        context.setFeedback({ status: 'error', message: labels.unnamedItemRemediation });
        return;
    }

    updatePending(context, item.id, 'add');
    context.setFeedback({ status: 'idle' });

    try {
        const updated = await context.api.updateItem(item.id, {
            name: item.name,
            completed: !item.completed,
        });
        context.setItems(current =>
            current.map(currentItem => (currentItem.id === updated.id ? updated : currentItem)),
        );
        context.setFeedback({
            status: 'success',
            message: labels.itemCompletionChanged(itemName(updated), updated.completed),
        });
    } catch (error) {
        context.setFeedback({ status: 'error', message: messageFor(error, labels.updateItemFailed) });
    } finally {
        updatePending(context, item.id, 'remove');
    }
}

async function removeItem(context: ActionContext, item: ItemDto): Promise<boolean> {
    updatePending(context, item.id, 'add');
    context.setFeedback({ status: 'idle' });

    try {
        await context.api.deleteItem(item.id);
        context.setItems(current => current.filter(currentItem => currentItem.id !== item.id));
        context.setFeedback({ status: 'success', message: labels.itemRemoved(itemName(item)) });
        return true;
    } catch (error) {
        context.setFeedback({ status: 'error', message: messageFor(error, labels.removeItemFailed) });
        return false;
    } finally {
        updatePending(context, item.id, 'remove');
    }
}

export function useItemActions(api: ItemsApi, setItems: SetItems) {
    const [feedback, setFeedback] = useState<ItemActionFeedback>({ status: 'idle' });
    const [isAdding, setIsAdding] = useState(false);
    const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(new Set());
    const context = useMemo(
        () => ({ api, setItems, setFeedback, setIsAdding, setPendingItemIds }),
        [api, setItems],
    );

    const add = useCallback((name: string) => addItem(context, name), [context]);
    const toggle = useCallback((item: ItemDto) => toggleItem(context, item), [context]);
    const remove = useCallback((item: ItemDto) => removeItem(context, item), [context]);

    return { feedback, isAdding, pendingItemIds, addItem: add, toggleItem: toggle, removeItem: remove };
}
