import type { ItemsPaginationState } from '../hooks/use-items';
import { labels } from '../labels';

export interface ItemsPaginationProps {
    hasNextPage: boolean;
    state: ItemsPaginationState;
    onLoadMore: () => void;
}

function buttonLabel(state: ItemsPaginationState, hasNextPage: boolean): string {
    if (state.status === 'loading') return labels.loadingMoreItems;
    if (!hasNextPage) return labels.allItemsLoaded;
    return state.status === 'error' ? labels.retryLoadingMore : labels.loadMoreItems;
}

function statusMessage(state: ItemsPaginationState): string {
    if (state.status === 'loading') return labels.loadingMoreItems;
    return state.status === 'idle' ? state.announcement : '';
}

export function ItemsPagination({ hasNextPage, state, onLoadMore }: ItemsPaginationProps) {
    const hasLoadedPage = state.status === 'idle' && state.announcement !== '';
    const showButton = hasNextPage || hasLoadedPage || state.status !== 'idle';

    return (
        <div className="items-pagination">
            {state.status === 'error' && (
                <p id="items-pagination-error" className="pagination-error" role="alert">
                    {state.message}
                </p>
            )}
            {showButton && (
                <button
                    className="button button-secondary"
                    type="button"
                    aria-controls="items-list"
                    aria-describedby={
                        state.status === 'error' ? 'items-pagination-error' : undefined
                    }
                    disabled={state.status === 'loading' || !hasNextPage}
                    onClick={onLoadMore}
                >
                    {buttonLabel(state, hasNextPage)}
                </button>
            )}
            <p className="visually-hidden pagination-status" aria-live="polite" aria-atomic="true">
                {statusMessage(state)}
            </p>
        </div>
    );
}
