// The notification entity and the rules that govern it. This file imports
// nothing: it is the layer every other layer is allowed to depend on, and
// depending on anything itself would make the rules untestable without it.

// Carries no message text: the wording belongs to the interface, and storing
// it would freeze today's phrasing into every row (see the outbox migration).
//
// What a notification names is decided by its kind: a task for a created
// task, a project for an addition to one, a project and an invitation for an
// invitation (#401). The project name is read when the list is read, never
// stored in the row, so a renamed project shows its current name.
export type NotificationKind = 'item.created' | 'membership.created' | 'invitation.created';
export type InvitationStatus = 'pending' | 'accepted' | 'declined';

export interface Notification {
    id: string;
    kind: NotificationKind;
    itemId: string | null;
    projectId: string | null;
    projectName: string | null;
    invitationId: string | null;
    invitationStatus: InvitationStatus | null;
    userId: string;
    readAt: string | null;
    createdAt: string;
}

export class NotificationError extends Error {
    constructor(
        readonly code: string,
        readonly httpStatus: number,
        message: string,
    ) {
        super(message);
        this.name = new.target.name;
    }
}

// Someone else's notification is reported the same way, for the same reason
// items.ts reports ItemNotFound on a foreign item: a 403 would confirm the
// identifier designates something real.
export class NotificationNotFound extends NotificationError {
    constructor(readonly notificationId: string) {
        super('notification_not_found', 404, `Notification ${notificationId} not found`);
    }
}

// A cursor handed back by a client is outside data like any other. The
// refusal lives here so the error middleware finds it with the domain's other
// refusals.
export class InvalidNotificationCursor extends NotificationError {
    constructor() {
        super('invalid_notification_cursor', 400, 'Notification cursor was not issued by this API');
    }
}
