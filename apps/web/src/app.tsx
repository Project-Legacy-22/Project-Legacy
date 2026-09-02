import { itemsApi } from './api/items-api';
import type { ItemsApi } from './api/items-api';
import { TodoPage } from './components/todo-page';
import { useItems } from './hooks/use-items';

export interface AppProps {
    api?: ItemsApi;
}

export function App({ api = itemsApi }: AppProps) {
    const state = useItems(api);

    return (
        <TodoPage
            items={state.items}
            loadState={state.loadState}
            feedback={state.feedback}
            isAdding={state.isAdding}
            pendingItemIds={state.pendingItemIds}
            onAdd={state.addItem}
            onToggle={state.toggleItem}
            onRemove={state.removeItem}
            onRetry={state.retry}
        />
    );
}
