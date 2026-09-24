import { useCallback, useState } from 'react';

import type { MembersApi } from '../api/members-api';
import type { NotificationDto, NotificationsApi } from '../api/notifications-api';
import { useAnswerInvitation } from '../hooks/use-answer-invitation';
import type { InvitationAnswer } from '../hooks/use-answer-invitation';
import { useNotificationsList } from '../hooks/use-notifications-list';
import { labels } from '../labels';
import { NotificationsPanelContent } from './notifications-panel-content';

export interface NotificationsPanelProps {
    api: NotificationsApi;
    members: MembersApi;
    // The project the person just joined, so the page can show it.
    onJoined: (projectId: string) => void;
}

// Answering reads the notification too: the question it asked is settled.
function useInvitationAnswers(
    members: MembersApi,
    list: ReturnType<typeof useNotificationsList>,
    onJoined: NotificationsPanelProps['onJoined'],
) {
    const { recordAnswer, markAsRead } = list;
    const onAnswered = useCallback(
        (notification: NotificationDto, answer: InvitationAnswer) => {
            recordAnswer(notification.id, answer);
            if (notification.readAt === null) void markAsRead(notification.id);
            if (answer === 'accepted' && notification.projectId !== null) onJoined(notification.projectId);
        },
        [recordAnswer, markAsRead, onJoined],
    );
    return useAnswerInvitation(members, onAnswered);
}

// Collapsed by default, behind the badge in the session banner: most visits
// never open it, so the list is fetched only once a caller asks for it (see
// useNotificationsList's isEnabled). Closing and reopening is also how a
// failed load is retried -- toggling isEnabled false then true runs the
// effect again, which a dedicated retry button would only duplicate.
export function NotificationsPanel({ api, members, onJoined }: NotificationsPanelProps) {
    const [isOpen, setIsOpen] = useState(false);
    const list = useNotificationsList(api, isOpen);
    const answers = useInvitationAnswers(members, list, onJoined);

    return (
        // aria-label rather than nothing: a section without an accessible
        // name is not a region, so the whole panel escaped region navigation.
        <section
            className="notifications-panel"
            aria-label={labels.notificationsTitle}
            aria-busy={isOpen && list.loadState.status === 'loading'}
        >
            <button
                type="button"
                className="button button-quiet"
                aria-expanded={isOpen}
                aria-controls="notifications-panel-content"
                onClick={() => setIsOpen(current => !current)}
            >
                {isOpen ? labels.hideNotifications : labels.showNotifications}
            </button>
            {isOpen && (
                <NotificationsPanelContent
                    notifications={list.notifications}
                    loadState={list.loadState}
                    pendingIds={list.pendingIds}
                    answeringIds={answers.pendingIds}
                    answerFeedback={answers.feedback}
                    onAnswer={answers.answer}
                    hasNextPage={list.hasNextPage}
                    paginationState={list.paginationState}
                    onMarkAsRead={list.markAsRead}
                    onLoadMore={() => void list.loadMore()}
                    onRetry={list.retry}
                    actionError={list.actionError}
                />
            )}
        </section>
    );
}
