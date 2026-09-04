import type { ItemDto } from '../api/items-api';
import { labels } from '../labels';
import type {
    AddItemResult,
    ItemActionFeedback,
    ItemsLoadState,
    ItemsPaginationState,
} from '../hooks/use-items';
import { ActionFeedback } from './action-feedback';
import { AddItemSection } from './add-item-section';
import { ItemsSection } from './items-section';
import { PageHeader } from './page-header';

export interface TodoPageProps {
    items: readonly ItemDto[];
    loadState: ItemsLoadState;
    feedback: ItemActionFeedback;
    isAdding: boolean;
    pendingItemIds: ReadonlySet<string>;
    hasNextPage: boolean;
    paginationState: ItemsPaginationState;
    onAdd: (name: string) => Promise<AddItemResult>;
    onToggle: (item: ItemDto) => Promise<void>;
    onRemove: (item: ItemDto) => Promise<boolean>;
    onLoadMore: () => void;
    onRetry: () => void;
}

export function TodoPage(props: TodoPageProps) {
    const isMutationDisabled = props.loadState.status !== 'ready';

    return (
        <div className="app-shell">
            <a className="skip-link" href="#main-content">
                {labels.skipToContent}
            </a>
            <PageHeader />
            <main id="main-content" className="main-content" tabIndex={-1}>
                <AddItemSection
                    isAdding={props.isAdding}
                    isDisabled={isMutationDisabled}
                    onAdd={props.onAdd}
                />
                <ItemsSection
                    items={props.items}
                    loadState={props.loadState}
                    pendingItemIds={props.pendingItemIds}
                    hasNextPage={props.hasNextPage}
                    paginationState={props.paginationState}
                    onToggle={props.onToggle}
                    onRemove={props.onRemove}
                    onLoadMore={props.onLoadMore}
                    onRetry={props.onRetry}
                />
                <ActionFeedback feedback={props.feedback} />
            </main>
        </div>
    );
}
