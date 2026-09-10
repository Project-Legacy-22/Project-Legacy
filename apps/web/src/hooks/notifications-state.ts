export type NotificationsLoadState =
    | { status: 'loading' }
    | { status: 'ready' }
    | { status: 'error'; message: string };

export type NotificationsPaginationState =
    | { status: 'idle'; announcement: string }
    | { status: 'loading' }
    | { status: 'error'; message: string };
