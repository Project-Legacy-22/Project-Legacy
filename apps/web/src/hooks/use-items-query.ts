import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ItemDto, ItemsApi } from '../api/items-api';
import { labels } from '../labels';
import type { ItemsLoadState, ItemsPaginationState } from './items-state';

export type SetItems = Dispatch<SetStateAction<readonly ItemDto[]>>;

interface LoadItemsContext {
    api: ItemsApi;
    signal: AbortSignal;
    setItems: SetItems;
    setLoadState: Dispatch<SetStateAction<ItemsLoadState>>;
    setNextCursor: Dispatch<SetStateAction<string | null>>;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

async function loadItems(context: LoadItemsContext) {
    const { api, signal, setItems, setLoadState } = context;
    setLoadState({ status: 'loading' });

    try {
        const page = await api.listItems({ signal });
        if (signal.aborted) return;
        setItems(page.items);
        context.setNextCursor(page.nextCursor);
        setLoadState({ status: 'ready' });
    } catch (error) {
        if (signal.aborted || isAbortError(error)) return;
        const message = error instanceof ApiError ? error.message : labels.loadItemsFailed;
        setLoadState({ status: 'error', message });
    }
}

function appendUniqueItems(
    current: readonly ItemDto[],
    nextPage: readonly ItemDto[],
): readonly ItemDto[] {
    const knownIds = new Set(current.map(item => item.id));
    return [...current, ...nextPage.filter(item => !knownIds.has(item.id))];
}

function useItemPagination(api: ItemsApi, setItems: SetItems) {
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [paginationState, setPaginationState] = useState<ItemsPaginationState>({
        status: 'idle',
        announcement: '',
    });
    const requestController = useRef<AbortController | null>(null);

    useEffect(() => () => requestController.current?.abort(), []);

    const loadMore = useCallback(async () => {
        if (nextCursor === null || requestController.current !== null) return;
        const controller = new AbortController();
        requestController.current = controller;
        setPaginationState({ status: 'loading' });

        try {
            const page = await api.listItems({ signal: controller.signal, cursor: nextCursor });
            if (controller.signal.aborted) return;
            setItems(current => appendUniqueItems(current, page.items));
            setNextCursor(page.nextCursor);
            setPaginationState({
                status: 'idle',
                announcement: labels.itemsLoaded(page.items.length),
            });
        } catch (error) {
            if (controller.signal.aborted || isAbortError(error)) return;
            const message = error instanceof ApiError ? error.message : labels.loadMoreItemsFailed;
            setPaginationState({ status: 'error', message });
        } finally {
            if (requestController.current === controller) requestController.current = null;
        }
    }, [api, nextCursor, setItems]);

    const reset = useCallback(() => {
        requestController.current?.abort();
        requestController.current = null;
        setNextCursor(null);
        setPaginationState({ status: 'idle', announcement: '' });
    }, []);

    return {
        setNextCursor,
        hasNextPage: nextCursor !== null,
        paginationState,
        loadMore,
        reset,
    };
}

export function useItemsQuery(api: ItemsApi) {
    const [items, setItems] = useState<readonly ItemDto[]>([]);
    const [loadState, setLoadState] = useState<ItemsLoadState>({ status: 'loading' });
    const [loadAttempt, setLoadAttempt] = useState(0);
    const pagination = useItemPagination(api, setItems);

    useEffect(() => {
        const controller = new AbortController();
        pagination.reset();
        void loadItems({
            api,
            signal: controller.signal,
            setItems,
            setLoadState,
            setNextCursor: pagination.setNextCursor,
        });
        return () => controller.abort();
    }, [api, loadAttempt, pagination.reset, pagination.setNextCursor]);

    const retry = useCallback(() => setLoadAttempt(attempt => attempt + 1), []);

    return {
        items,
        setItems,
        loadState,
        hasNextPage: pagination.hasNextPage,
        paginationState: pagination.paginationState,
        loadMore: pagination.loadMore,
        retry,
    };
}
