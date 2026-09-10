import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ItemDto, ItemsApi } from '../api/items-api';
import { labels } from '../labels';
import type { ItemsLoadState, ItemsPaginationState } from './items-state';

export type SetItems = Dispatch<SetStateAction<readonly ItemDto[]>>;

interface LoadItemsContext {
    api: ItemsApi;
    projectId: string;
    signal: AbortSignal;
    setItems: SetItems;
    setLoadState: Dispatch<SetStateAction<ItemsLoadState>>;
    setNextCursor: Dispatch<SetStateAction<string | null>>;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

async function loadItems(context: LoadItemsContext): Promise<boolean> {
    const { api, signal, setItems, setLoadState } = context;
    setLoadState({ status: 'loading' });

    try {
        const page = await api.listItems(context.projectId, { signal });
        if (signal.aborted) return false;
        setItems(page.items);
        context.setNextCursor(page.nextCursor);
        setLoadState({ status: 'ready' });
        return true;
    } catch (error) {
        if (signal.aborted || isAbortError(error)) return false;
        const message = error instanceof ApiError ? error.message : labels.loadItemsFailed;
        setLoadState({ status: 'error', message });
        return false;
    }
}

function appendUniqueItems(current: readonly ItemDto[], nextPage: readonly ItemDto[]): readonly ItemDto[] {
    const knownIds = new Set(current.map((item) => item.id));
    return [...current, ...nextPage.filter((item) => !knownIds.has(item.id))];
}

interface AppendPageContext {
    api: ItemsApi;
    projectId: string;
    cursor: string;
    controller: AbortController;
    setItems: SetItems;
    setNextCursor: Dispatch<SetStateAction<string | null>>;
    setPaginationState: Dispatch<SetStateAction<ItemsPaginationState>>;
}

async function appendNextPage(context: AppendPageContext): Promise<void> {
    const { api, projectId, cursor, controller } = context;
    try {
        const page = await api.listItems(projectId, {
            signal: controller.signal,
            cursor,
        });
        if (controller.signal.aborted) return;
        context.setItems((current) => appendUniqueItems(current, page.items));
        context.setNextCursor(page.nextCursor);
        context.setPaginationState({
            status: 'idle',
            announcement: labels.itemsLoaded(page.items.length),
        });
    } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        const message = error instanceof ApiError ? error.message : labels.loadMoreItemsFailed;
        context.setPaginationState({ status: 'error', message });
    }
}

function useItemPagination(api: ItemsApi, projectId: string | null, setItems: SetItems) {
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [paginationState, setPaginationState] = useState<ItemsPaginationState>({
        status: 'idle',
        announcement: '',
    });
    const requestController = useRef<AbortController | null>(null);

    useEffect(() => () => requestController.current?.abort(), []);

    const loadMore = useCallback(async () => {
        if (projectId === null || nextCursor === null || requestController.current !== null) return;
        const controller = new AbortController();
        requestController.current = controller;
        setPaginationState({ status: 'loading' });
        try {
            await appendNextPage({
                api,
                projectId,
                cursor: nextCursor,
                controller,
                setItems,
                setNextCursor,
                setPaginationState,
            });
        } finally {
            if (requestController.current === controller) requestController.current = null;
        }
    }, [api, nextCursor, projectId, setItems]);

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

interface RefreshItemsOptions {
    api: ItemsApi;
    projectId: string | null;
    setItems: SetItems;
    setLoadState: Dispatch<SetStateAction<ItemsLoadState>>;
    pagination: ReturnType<typeof useItemPagination>;
}

function useRefreshItems(options: RefreshItemsOptions): () => Promise<boolean> {
    const controllerRef = useRef<AbortController | null>(null);
    useEffect(() => () => controllerRef.current?.abort(), [options.projectId]);

    return useCallback(async () => {
        if (options.projectId === null) return false;
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        options.pagination.reset();

        try {
            return await loadItems({
                api: options.api,
                projectId: options.projectId,
                signal: controller.signal,
                setItems: options.setItems,
                setLoadState: options.setLoadState,
                setNextCursor: options.pagination.setNextCursor,
            });
        } finally {
            if (controllerRef.current === controller) controllerRef.current = null;
        }
    }, [options]);
}

export function useItemsQuery(api: ItemsApi, projectId: string | null) {
    const [items, setItems] = useState<readonly ItemDto[]>([]);
    const [loadState, setLoadState] = useState<ItemsLoadState>({
        status: 'loading',
    });
    const [loadAttempt, setLoadAttempt] = useState(0);
    const pagination = useItemPagination(api, projectId, setItems);
    const refresh = useRefreshItems({ api, projectId, setItems, setLoadState, pagination });

    useEffect(() => {
        const controller = new AbortController();
        pagination.reset();
        if (projectId === null) {
            setItems([]);
            setLoadState({ status: 'ready' });
            return () => controller.abort();
        }
        void loadItems({
            api,
            projectId,
            signal: controller.signal,
            setItems,
            setLoadState,
            setNextCursor: pagination.setNextCursor,
        });
        return () => controller.abort();
    }, [api, loadAttempt, pagination.reset, pagination.setNextCursor, projectId]);

    const retry = useCallback(() => setLoadAttempt((attempt) => attempt + 1), []);
    return {
        items,
        setItems,
        loadState,
        hasNextPage: pagination.hasNextPage,
        paginationState: pagination.paginationState,
        loadMore: pagination.loadMore,
        retry,
        refresh,
    };
}
