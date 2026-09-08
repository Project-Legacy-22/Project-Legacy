import { useCallback, useState } from 'react';

import { ApiError } from '../api/items-api';
import type { AccountApi } from '../api/account-api';
import { labels } from '../labels';
import type { SaveFile } from '../save-file';

// Idle carries no message, which is what tells the live region to stay silent
// rather than repeat the last thing that happened.
export type PersonalDataFeedback =
    | { status: 'idle' }
    | { status: 'success'; message: string }
    | { status: 'error'; message: string };

export type PersonalDataActivity = 'idle' | 'exporting' | 'deleting';

export interface PersonalDataDependencies {
    api: AccountApi;
    save: SaveFile;
    // Called once the account is gone. The hook does not decide what the
    // application shows next: it reports the fact, and the session state that
    // owns "who is signed in" acts on it.
    onDeleted: () => void;
}

function messageOf(error: unknown, fallback: string): string {
    return error instanceof ApiError ? error.message : fallback;
}

export function usePersonalData({ api, save, onDeleted }: PersonalDataDependencies) {
    const [activity, setActivity] = useState<PersonalDataActivity>('idle');
    const [feedback, setFeedback] = useState<PersonalDataFeedback>({ status: 'idle' });

    const exportPersonalData = useCallback(async (): Promise<void> => {
        setActivity('exporting');
        setFeedback({ status: 'idle' });
        try {
            save(await api.exportPersonalData(), labels.exportFilename);
            setFeedback({ status: 'success', message: labels.exportDone });
        } catch (error) {
            setFeedback({ status: 'error', message: messageOf(error, labels.exportFailed) });
        } finally {
            setActivity('idle');
        }
    }, [api, save]);

    const deleteAccount = useCallback(
        async (confirmation: string): Promise<void> => {
            setActivity('deleting');
            setFeedback({ status: 'idle' });
            try {
                await api.deleteAccount({ confirmation });
                // No success message: the screen this hook feeds is about to be
                // replaced by the signed-out one, and a confirmation nobody can
                // read is a confirmation that was never given.
                onDeleted();
            } catch (error) {
                setFeedback({
                    status: 'error',
                    message: messageOf(error, labels.deleteAccountFailed),
                });
            } finally {
                setActivity('idle');
            }
        },
        [api, onDeleted],
    );

    return { activity, feedback, exportPersonalData, deleteAccount };
}
