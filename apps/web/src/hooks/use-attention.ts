import { useCallback, useEffect, useState } from 'react';

import { ApiError } from '../api/items-api';
import type { AttentionApi, AttentionDto } from '../api/attention-api';
import { localToday } from '../item-due-date';
import { labels } from '../labels';
import type { LoadState } from './view-state';

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

// What the home screen shows (US-20). Asked again by reload() after any change
// made to a task in this tab: a task completed below must leave the list above
// without a page reload.
//
// The last answer stays on screen while the next one loads, like the task list
// does on a refresh: blanking it would move the page under the person reading.
export function useAttention(api: AttentionApi) {
    const [attention, setAttention] = useState<AttentionDto | null>(null);
    const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        setLoadState({ status: 'loading' });

        api.listAttention(localToday(new Date()), controller.signal)
            .then((answer) => {
                if (controller.signal.aborted) return;
                setAttention(answer);
                setLoadState({ status: 'ready' });
            })
            .catch((error: unknown) => {
                if (controller.signal.aborted || isAbortError(error)) return;
                const message = error instanceof ApiError ? error.message : labels.loadAttentionFailed;
                setLoadState({ status: 'error', message });
            });

        return () => controller.abort();
    }, [api, revision]);

    const reload = useCallback(() => setRevision((current) => current + 1), []);

    return { attention, loadState, reload };
}
