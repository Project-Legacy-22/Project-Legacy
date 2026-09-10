import { useCallback, useEffect, useState } from 'react';

import type { NotificationsApi } from '../api/notifications-api';

// The visible end of the event flow. The count is re-read on an interval
// because nothing tells the browser that a worker, in another process, has
// just handled an event: the effect arrives after the response that triggered
// it, which is exactly what being decoupled means.
//
// A failure leaves the previous count in place rather than showing zero or an
// error: a notification badge is not worth interrupting the page for, and
// claiming "none" when the answer is unknown would be a lie.
const REFRESH_MS = 2_000;

export function useNotifications(api: NotificationsApi, isEnabled: boolean) {
    const [unread, setUnread] = useState(0);

    const read = useCallback(
        (signal: AbortSignal) => {
            api.unreadCount(signal)
                .then(count => {
                    if (!signal.aborted) setUnread(count);
                })
                .catch(() => {
                    // Deliberately silent: see above.
                });
        },
        [api],
    );

    useEffect(() => {
        if (!isEnabled) return;

        const controller = new AbortController();
        read(controller.signal);
        const timer = setInterval(() => read(controller.signal), REFRESH_MS);

        return () => {
            controller.abort();
            clearInterval(timer);
        };
    }, [isEnabled, read]);

    return unread;
}
