import type { ItemPriority, ItemStatus } from '@legacy/contracts';
import type { ItemDto } from '../api/items-api';
import type { UpdateItemBody } from '@legacy/contracts';
import { labels } from '../labels';
import type { ItemsFilterValues, ItemsLoadState, ItemsPaginationState } from '../hooks/use-items';
import { ItemsFilters } from './items-filters';
import { KanbanBoard } from './kanban-board';
import { ItemsPagination } from './items-pagination';
import { ViewState } from './view-state';

export interface ItemsContentProps {
    items: readonly ItemDto[];
    loadState: ItemsLoadState;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    filterValues: ItemsFilterValues;
    hasActiveFilters: boolean;
    onMove: (item: ItemDto, status: ItemStatus) => Promise<boolean>;
    onUpdate: (item: ItemDto, changes: UpdateItemBody) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onLoadMore: () => void;
    onRetry: () => void;
    onSearchChange: (search: string) => void;
    onStatusChange: (status: ItemStatus | '') => void;
    onPriorityChange: (priority: ItemPriority | '') => void;
    onDueDateChange: (dueDate: string) => void;
    onNoDueDateChange: (noDueDate: boolean) => void;
    onClearFilters: () => void;
}

function retryItems(onRetry: () => void): void {
    onRetry();
    // The button that was focused is about to be replaced by the list, so the
    // focus has to land somewhere deliberate. The heading is the region the
    // person asked to see again, and it is the only focus move here: the state
    // changes below never take focus by themselves.
    document.querySelector<HTMLElement>('#items-heading')?.focus();
}

// Focusing the field is the action, not scrolling to it: somebody who cannot
// see the panel gets the caret where the task is typed.
function focusItemName(): void {
    document.querySelector<HTMLInputElement>('#item-name')?.focus();
}

// An empty page means something different depending on whether a filter
// narrowed it: the API answers both the same way (see items-search.test.ts),
// so the distinction and its message are made here, where it is known
// whether a criterion is active.
function emptyState(itemsLength: number, hasActiveFilters: boolean, onClearFilters: () => void) {
    return hasActiveFilters
        ? {
            isEmpty: itemsLength === 0,
            message: labels.noSearchResults,
            action: { label: labels.clearFilters, onAction: onClearFilters },
        }
        : {
            isEmpty: itemsLength === 0,
            message: labels.emptyItems,
            action: { label: labels.addItem, onAction: focusItemName },
        };
}

interface ItemsListSectionProps {
    items: readonly ItemDto[];
    loadState: ItemsLoadState;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    hasActiveFilters: boolean;
    isDisabled: boolean;
    onMove: (item: ItemDto, status: ItemStatus) => Promise<boolean>;
    onUpdate: (item: ItemDto, changes: UpdateItemBody) => Promise<boolean>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onLoadMore: () => void;
    onRetry: () => void;
    onClearFilters: () => void;
}

function ItemsListSection(props: ItemsListSectionProps) {
    const empty = emptyState(props.items.length, props.hasActiveFilters, props.onClearFilters);

    return (
        <ViewState
            state={props.loadState}
            loadingMessage={labels.loadingItems}
            empty={empty}
            onRetry={() => retryItems(props.onRetry)}
            keepsChildrenWhenEmpty
        >
            <KanbanBoard
                items={props.items}
                isDisabled={props.isDisabled}
                pendingItemIds={props.pendingItemIds}
                onMove={props.onMove}
                onUpdate={props.onUpdate}
                onRemove={props.onRemove}
            />
            <ItemsPagination
                hasNextPage={props.hasNextPage}
                state={props.paginationState}
                onLoadMore={props.onLoadMore}
            />
        </ViewState>
    );
}

export function ItemsContent(props: ItemsContentProps) {
    const isDisabled = props.loadState.status !== 'ready';

    return (
        <>
            <ItemsFilters
                values={props.filterValues}
                hasActiveFilters={props.hasActiveFilters}
                isDisabled={isDisabled}
                onSearchChange={props.onSearchChange}
                onStatusChange={props.onStatusChange}
                onPriorityChange={props.onPriorityChange}
                onDueDateChange={props.onDueDateChange}
                onNoDueDateChange={props.onNoDueDateChange}
                onClear={props.onClearFilters}
            />
            <ItemsListSection
                items={props.items}
                loadState={props.loadState}
                pendingItemIds={props.pendingItemIds}
                hasNextPage={props.hasNextPage}
                paginationState={props.paginationState}
                hasActiveFilters={props.hasActiveFilters}
                isDisabled={isDisabled}
                onMove={props.onMove}
                onUpdate={props.onUpdate}
                onRemove={props.onRemove}
                onLoadMore={props.onLoadMore}
                onRetry={props.onRetry}
                onClearFilters={props.onClearFilters}
            />
        </>
    );
}
