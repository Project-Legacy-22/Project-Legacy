export type ItemsLoadState =
    | { status: 'loading' }
    | { status: 'ready' }
    | { status: 'error'; message: string };

export type ItemActionFeedback =
    | { status: 'idle' }
    | { status: 'success'; message: string }
    | { status: 'error'; message: string };

export type AddItemResult = { status: 'success' } | { status: 'error'; message: string };
