import { useCallback, useState } from 'react';

import { ApiError } from '../api/items-api';
import type { MembersApi } from '../api/members-api';
import type { NotificationDto } from '../api/notifications-api';
import { labels } from '../labels';
import type { Feedback } from './view-state';

export type InvitationAnswer = 'accepted' | 'declined';

// The answer of the person invited, given from the notification that asked
// (#401). What follows an answer -- the row showing it, the project list
// gaining the project -- belongs to the caller, which owns those states.
export function useAnswerInvitation(
    api: MembersApi,
    onAnswered: (notification: NotificationDto, answer: InvitationAnswer) => void,
) {
    const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
    const [feedback, setFeedback] = useState<Feedback>({ status: 'idle' });

    const answer = useCallback(
        async (notification: NotificationDto, accept: boolean) => {
            if (notification.invitationId === null) return;
            const projectName = notification.projectName ?? '';
            setPendingIds(current => new Set(current).add(notification.id));
            setFeedback({ status: 'idle' });
            try {
                await api.answerInvitation(notification.invitationId, accept);
                onAnswered(notification, accept ? 'accepted' : 'declined');
                setFeedback({
                    status: 'success',
                    message: accept ? labels.joinedProject(projectName) : labels.declinedProject(projectName),
                });
            } catch (error) {
                const message = error instanceof ApiError ? error.message : labels.answerInvitationFailed;
                setFeedback({ status: 'error', message });
            } finally {
                setPendingIds(current => {
                    const next = new Set(current);
                    next.delete(notification.id);
                    return next;
                });
            }
        },
        [api, onAnswered],
    );

    return { pendingIds, feedback, answer };
}
