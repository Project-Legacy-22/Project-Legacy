import { describe, expect, it } from 'vitest';

import { INVITATION_CREATED_V1, ITEM_CREATED_V1, MEMBERSHIP_CREATED_V1 } from '@legacy/contracts';
import type { DomainEvent } from '@legacy/contracts';

import { consume } from './event-consumer.js';
import type { NotificationStore } from './notification-store.js';
import { recordingLogger } from '../../contracts/test/fakes/recording-logger.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const ITEM_ID = '01931f3a-0000-7000-8000-000000000002';

const EVENT: DomainEvent = {
    id: '01931f3a-0000-7000-8000-000000000001',
    name: ITEM_CREATED_V1,
    occurredAt: '2026-09-04T10:00:00.000Z',
    payload: { itemId: ITEM_ID, ownerId: OWNER_ID },
};

interface Notification {
    eventId: string;
    userId: string;
    // One or the other, never both: the notifications_kind_chk constraint refuses a row that would
    // name a task and a project.
    itemId?: string;
    projectId?: string;
    invitationId?: string;
}

// A real in-memory store, with the same uniqueness rule as the database: the key is the event
// identifier. A mock that simply returned `false` on the second call would prove that the test can
// count, not that the system is idempotent.
function fakeNotifications(): NotificationStore & { created: Notification[] } {
    const created: Notification[] = [];
    const handled = new Set<string>();

    return {
        created,
        notifyItemCreated: (eventId, userId, itemId) => {
            if (handled.has(eventId)) return Promise.resolve(false);
            handled.add(eventId);
            created.push({ eventId, userId, itemId });
            return Promise.resolve(true);
        },
        // The same `handled` set, on purpose: processed_events holds one row per event, whatever
        // the kind of the notification. Two separate sets would let a cross replay through.
        notifyMemberAdded: (eventId, userId, projectId) => {
            if (handled.has(eventId)) return Promise.resolve(false);
            handled.add(eventId);
            created.push({ eventId, userId, projectId });
            return Promise.resolve(true);
        },
        notifyInvited: ({ eventId, userId, projectId, invitationId }) => {
            if (handled.has(eventId)) return Promise.resolve(false);
            handled.add(eventId);
            created.push({ eventId, userId, projectId, invitationId });
            return Promise.resolve(true);
        },
        countUnread: userId =>
            Promise.resolve(created.filter(notification => notification.userId === userId).length),
        // Neither is reached by consume: this suite exercises the worker's own
        // effect, not the list or mark-as-read screen US-18 added.
        findPageForAccount: () => Promise.reject(new Error('not exercised by this suite')),
        markAsRead: () => Promise.reject(new Error('not exercised by this suite')),
    };
}

describe('consume', () => {
    it('produces a notification for the owner of the item', async () => {
        const notifications = fakeNotifications();

        const outcome = await consume(EVENT, { notifications, logger: recordingLogger() });

        expect(outcome).toBe('applied');
        expect(notifications.created).toEqual([
            { eventId: EVENT.id, userId: OWNER_ID, itemId: ITEM_ID },
        ]);
        expect(await notifications.countUnread(OWNER_ID)).toBe(1);
    });

    // The US-10 criterion: replaying the same event twice leaves the system in the same state. The
    // relay republishes what it could not mark, so a double delivery is not a textbook hypothesis.
    it('leaves the same state when the same event is replayed', async () => {
        const notifications = fakeNotifications();
        const logger = recordingLogger();

        const first = await consume(EVENT, { notifications, logger });
        const second = await consume(EVENT, { notifications, logger });

        expect(first).toBe('applied');
        expect(second).toBe('alreadyHandled');
        expect(notifications.created).toHaveLength(1);
        expect(await notifications.countUnread(OWNER_ID)).toBe(1);
    });

    it('treats two distinct events as two facts', async () => {
        const notifications = fakeNotifications();
        const other: DomainEvent = { ...EVENT, id: '01931f3a-0000-7000-8000-000000000009' };

        await consume(EVENT, { notifications, logger: recordingLogger() });
        await consume(other, { notifications, logger: recordingLogger() });

        expect(notifications.created).toHaveLength(2);
    });

    it('logs identifiers only', async () => {
        const notifications = fakeNotifications();
        const logger = recordingLogger();

        await consume(EVENT, { notifications, logger });

        const written = JSON.stringify(logger.lines);
        expect(written).toContain(EVENT.id);
        expect(written).not.toContain(ITEM_ID);
    });
});

const PROJET_ID = '01931f3a-0000-7000-8000-000000000010';
const MEMBRE_ID = '00000000-0000-7000-8000-000000000011';
const AJOUTE_PAR = '00000000-0000-7000-8000-000000000012';

const EVENT_APPARTENANCE: DomainEvent = {
    id: '01931f3a-0000-7000-8000-000000000020',
    name: MEMBERSHIP_CREATED_V1,
    occurredAt: '2026-09-15T10:00:00.000Z',
    payload: { projectId: PROJET_ID, memberId: MEMBRE_ID, addedBy: AJOUTE_PAR },
};

describe('consume, a membership created', () => {
    it('notifies the person added, and only them', async () => {
        const notifications = fakeNotifications();

        const outcome = await consume(EVENT_APPARTENANCE, {
            notifications,
            logger: recordingLogger(),
        });

        expect(outcome).toBe('applied');
        expect(notifications.created).toEqual([
            { eventId: EVENT_APPARTENANCE.id, userId: MEMBRE_ID, projectId: PROJET_ID },
        ]);
        // The person who adds knows what they just did: announcing it to them would be noise, and
        // one more notification to clear.
        expect(notifications.created.map(n => n.userId)).not.toContain(AJOUTE_PAR);
    });

    it('does not notify twice on redelivery', async () => {
        const notifications = fakeNotifications();

        await consume(EVENT_APPARTENANCE, { notifications, logger: recordingLogger() });
        const second = await consume(EVENT_APPARTENANCE, {
            notifications,
            logger: recordingLogger(),
        });

        expect(second).toBe('alreadyHandled');
        expect(notifications.created).toHaveLength(1);
    });

    // The property one forgets: processed_events holds one row per event, not one per kind. Two
    // separate registers would let a cross replay produce two effects for a single identifier.
    it('shares the register of processed events with the other kinds', async () => {
        const notifications = fakeNotifications();
        const memeIdentifiant: DomainEvent = { ...EVENT_APPARTENANCE, id: EVENT.id };

        await consume(EVENT, { notifications, logger: recordingLogger() });
        const second = await consume(memeIdentifiant, {
            notifications,
            logger: recordingLogger(),
        });

        expect(second).toBe('alreadyHandled');
        expect(notifications.created).toHaveLength(1);
    });
});

// The two writes of the consumer -- the reservation and the notification -- are now made by a
// single database function. The fake below behaves like it: either both exist, or neither. A fake
// that separated them would let through the defect the review found.
describe('consume, atomicity of the effect', () => {
    it('does not mark an event processed when the notification could not be created', async () => {
        const notifications: NotificationStore = {
            notifyItemCreated: () => Promise.reject(new Error('notifications: notify failed')),
            notifyMemberAdded: () => Promise.reject(new Error('notifications: notify failed')),
            notifyInvited: () => Promise.reject(new Error('notifications: notify failed')),
            countUnread: () => Promise.resolve(0),
            findPageForAccount: () => Promise.reject(new Error('not exercised by this suite')),
            markAsRead: () => Promise.reject(new Error('not exercised by this suite')),
        };

        await expect(
            consume(EVENT, { notifications, logger: recordingLogger() }),
        ).rejects.toThrow(/notify failed/);
    });

    // Direct consequence: a redelivery after a failure must still have work to do. If the
    // reservation had survived the failure, this one would answer "already processed" and the
    // effect would be lost for good.
    it('applies the effect on the redelivery that follows a failure', async () => {
        const store = fakeNotifications();
        let failNext = true;
        const flaky: NotificationStore = {
            notifyItemCreated: (eventId, userId, itemId) => {
                if (failNext) {
                    failNext = false;
                    return Promise.reject(new Error('notifications: notify failed'));
                }
                return store.notifyItemCreated(eventId, userId, itemId);
            },
            notifyMemberAdded: (eventId, userId, projectId) =>
                store.notifyMemberAdded(eventId, userId, projectId),
            notifyInvited: invitation => store.notifyInvited(invitation),
            countUnread: userId => store.countUnread(userId),
            findPageForAccount: () => Promise.reject(new Error('not exercised by this suite')),
            markAsRead: () => Promise.reject(new Error('not exercised by this suite')),
        };

        await expect(consume(EVENT, { notifications: flaky, logger: recordingLogger() })).rejects.toThrow();
        const retry = await consume(EVENT, { notifications: flaky, logger: recordingLogger() });

        expect(retry).toBe('applied');
        expect(store.created).toHaveLength(1);
    });
});

// #401: the person invited answers from the notification, so it names the
// invitation, and only that person receives it.
describe('consume, invitation.created.v1', () => {
    const INVITATION: DomainEvent = {
        id: '01931f3a-0000-7000-8000-00000000000a',
        name: INVITATION_CREATED_V1,
        occurredAt: '2026-09-24T10:00:00.000Z',
        payload: {
            invitationId: '01931f3a-0000-7000-8000-00000000000b',
            projectId: '01931f3a-0000-7000-8000-00000000000c',
            inviteeId: '01931f3a-0000-7000-8000-00000000000d',
            invitedBy: OWNER_ID,
        },
    };

    it('notifies the person invited, and names the invitation', async () => {
        const notifications = fakeNotifications();

        await expect(consume(INVITATION, { notifications, logger: recordingLogger() })).resolves.toBe('applied');

        expect(notifications.created).toEqual([
            {
                eventId: INVITATION.id,
                userId: '01931f3a-0000-7000-8000-00000000000d',
                projectId: '01931f3a-0000-7000-8000-00000000000c',
                invitationId: '01931f3a-0000-7000-8000-00000000000b',
            },
        ]);
    });

    it('does not notify twice on redelivery', async () => {
        const notifications = fakeNotifications();
        const dependencies = { notifications, logger: recordingLogger() };

        await consume(INVITATION, dependencies);
        await expect(consume(INVITATION, dependencies)).resolves.toBe('alreadyHandled');

        expect(notifications.created).toHaveLength(1);
    });
});
