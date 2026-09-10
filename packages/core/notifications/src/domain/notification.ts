// The notification entity and the rules that govern it. This file imports
// nothing: it is the layer every other layer is allowed to depend on, and
// depending on anything itself would make the rules untestable without it.

// Carries no message text: the wording belongs to the interface, and storing
// it would freeze today's phrasing into every row (see the outbox migration).
export interface Notification {
    id: string;
    itemId: string;
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
