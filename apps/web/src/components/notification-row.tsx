import type { NotificationDto } from '../api/notifications-api';
import { labels } from '../labels';

export interface NotificationRowProps {
    notification: NotificationDto;
    isPending: boolean;
    isAnswering: boolean;
    onMarkAsRead: (id: string) => Promise<void>;
    onAnswer: (notification: NotificationDto, accept: boolean) => Promise<void>;
}

type InvitationAnswerProps = Pick<NotificationRowProps, 'notification' | 'isAnswering' | 'onAnswer'>;

// Accept and Decline while the invitation waits, and the answer once given:
// the row stays, so the person can see what they chose. Native buttons with
// the project in their name, so a screen reader listing buttons can tell two
// invitations apart.
function InvitationAnswer({ notification, isAnswering, onAnswer }: InvitationAnswerProps) {
    const projectName = notification.projectName ?? '';

    if (notification.invitationStatus === 'accepted') {
        return <span className="notification-status">{labels.invitationAccepted}</span>;
    }
    if (notification.invitationStatus === 'declined') {
        return <span className="notification-status">{labels.invitationDeclined}</span>;
    }

    return (
        <span className="notification-answer">
            <button
                type="button"
                className="button button-primary"
                aria-label={labels.acceptInvitation(projectName)}
                disabled={isAnswering}
                onClick={() => void onAnswer(notification, true)}
            >
                {labels.accept}
            </button>
            <button
                type="button"
                className="button button-secondary"
                aria-label={labels.declineInvitation(projectName)}
                disabled={isAnswering}
                onClick={() => void onAnswer(notification, false)}
            >
                {labels.decline}
            </button>
            {isAnswering && <span className="notification-status">{labels.answeringInvitation}</span>}
        </span>
    );
}

export function NotificationRow({ notification, isPending, isAnswering, onMarkAsRead, onAnswer }: NotificationRowProps) {
    const isRead = notification.readAt !== null;

    return (
        <li className="notification-row">
            <p>
                {labels.notificationText(notification.kind, notification.projectName)}
                <span className="notification-status">
                    {isRead ? labels.notificationRead : labels.notificationUnread}
                </span>
            </p>
            <time dateTime={notification.createdAt}>
                {new Date(notification.createdAt).toLocaleString()}
            </time>
            {notification.kind === 'invitation.created' && (
                <InvitationAnswer notification={notification} isAnswering={isAnswering} onAnswer={onAnswer} />
            )}
            {!isRead && (
                <button
                    type="button"
                    className="button button-quiet"
                    disabled={isPending}
                    onClick={() => void onMarkAsRead(notification.id)}
                >
                    {isPending ? labels.markingNotificationRead : labels.markNotificationRead}
                </button>
            )}
        </li>
    );
}
