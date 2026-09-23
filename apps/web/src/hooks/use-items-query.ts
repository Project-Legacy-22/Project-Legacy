import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { ApiError } from '../api/items-api';
import type { ItemDto, ItemsApi } from '../api/items-api';
import { labels } from '../labels';
import type { ListItemsFilters } from './use-items-filters';
import type { ItemsLoadState, ItemsPaginationState } from './items-state';

export type SetItems = Dispatch<SetStateAction<readonly ItemDto[]>>;

interface LoadItemsContext {
    api: ItemsApi;
    projectId: string;
    filters: ListItemsFilters;
    signal: AbortSignal;
    setItems: SetItems;
    setLoadState: Dispatch<SetStateAction<ItemsLoadState>>;
    setNextCursor: Dispatch<SetStateAction<string | null>>;
    announceResults: (count: number) => void;
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

async function loadItems(context: LoadItemsContext): Promise<boolean> {
    const { api, signal, setItems, setLoadState } = context;
    setLoadState({ status: 'loading' });

    try {
        const page = await api.listItems(context.projectId, { signal, ...context.filters });
        if (signal.aborted) return false;
        setItems(page.items);
        context.setNextCursor(page.nextCursor);
        setLoadState({ status: 'ready' });
        // Announced here rather than only on "load more": a search or filter
        // change replaces the whole list, and that is exactly the moment
        // someone using a screen reader needs to be told how many matched.
        context.announceResults(page.items.length);
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
    filters: ListItemsFilters;
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
            ...context.filters,
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

interface UseItemPaginationOptions {
    api: ItemsApi;
    projectId: string | null;
    filters: ListItemsFilters;
    setItems: SetItems;
}

function useItemPagination({ api, projectId, filters, setItems }: UseItemPaginationOptions) {
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
                filters,
                cursor: nextCursor,
                controller,
                setItems,
                setNextCursor,
                setPaginationState,
            });
        } finally {
            if (requestController.current === controller) requestController.current = null;
        }
    }, [api, filters, nextCursor, projectId, setItems]);

    const reset = useCallback(() => {
        requestController.current?.abort();
        requestController.current = null;
        setNextCursor(null);
        setPaginationState({ status: 'idle', announcement: '' });
    }, []);

    // A separate setter, not the full setPaginationState, so a caller outside
    // this hook can announce a result count without also being able to fake a
    // loading or error state.
    const announceResults = useCallback((count: number) => {
        setPaginationState({ status: 'idle', announcement: labels.itemsFound(count) });
    }, []);

    return {
        setNextCursor,
        hasNextPage: nextCursor !== null,
        paginationState,
        announceResults,
        loadMore,
        reset,
    };
}

interface RefreshItemsOptions {
    api: ItemsApi;
    projectId: string | null;
    filters: ListItemsFilters;
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
                filters: options.filters,
                signal: controller.signal,
                setItems: options.setItems,
                setLoadState: options.setLoadState,
                setNextCursor: options.pagination.setNextCursor,
                announceResults: options.pagination.announceResults,
            });
        } finally {
            if (controllerRef.current === controller) controllerRef.current = null;
        }
    }, [options]);
}

const NO_FILTERS: ListItemsFilters = {};

export function useItemsQuery(api: ItemsApi, projectId: string | null, filters: ListItemsFilters = NO_FILTERS) {
    const [items, setItems] = useState<readonly ItemDto[]>([]);
    const [loadState, setLoadState] = useState<ItemsLoadState>({
        status: 'loading',
    });
    const [loadAttempt, setLoadAttempt] = useState(0);
    const pagination = useItemPagination({ api, projectId, filters, setItems });
    const refresh = useRefreshItems({ api, projectId, filters, setItems, setLoadState, pagination });
    // Individual fields, not the filters object: a fresh object is built on
    // every render (see use-items-filters.ts), and an effect keyed on that
    // reference would reload on every render rather than on every change.
    const { search, status, priority, dueDate } = filters;

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
            filters: { search, status, priority, dueDate },
            signal: controller.signal,
            setItems,
            setLoadState,
            setNextCursor: pagination.setNextCursor,
            announceResults: pagination.announceResults,
        });
        return () => controller.abort();
    }, [api, loadAttempt, pagination.reset, pagination.setNextCursor, pagination.announceResults, projectId, search, status, priority, dueDate]);

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
