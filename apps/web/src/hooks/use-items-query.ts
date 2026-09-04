import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ItemDto, ItemsApi } from '../api/items-api';
import { labels } from '../labels';
import type { ItemsLoadState } from './items-state';

export type SetItems = Dispatch<SetStateAction<readonly ItemDto[]>>;

interface LoadItemsContext {
    api: ItemsApi;
    signal: AbortSignal;
    setItems: SetItems;
    setLoadState: Dispatch<SetStateAction<ItemsLoadState>>;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

async function loadItems({ api, signal, setItems, setLoadState }: LoadItemsContext) {
    setLoadState({ status: 'loading' });

    try {
        const page = await api.listItems({ signal });
        if (signal.aborted) return;
        setItems(page.items);
        setLoadState({ status: 'ready' });
    } catch (error) {
        if (signal.aborted || isAbortError(error)) return;
        const message = error instanceof ApiError ? error.message : labels.loadItemsFailed;
        setLoadState({ status: 'error', message });
    }
}

export function useItemsQuery(api: ItemsApi) {
    const [items, setItems] = useState<readonly ItemDto[]>([]);
    const [loadState, setLoadState] = useState<ItemsLoadState>({ status: 'loading' });
    const [loadAttempt, setLoadAttempt] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        void loadItems({ api, signal: controller.signal, setItems, setLoadState });
        return () => controller.abort();
    }, [api, loadAttempt]);

    const retry = useCallback(() => setLoadAttempt(attempt => attempt + 1), []);

    return { items, setItems, loadState, retry };
}
