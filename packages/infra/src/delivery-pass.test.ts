import { describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1 } from '@legacy/contracts';
import type { DomainEvent } from '@legacy/contracts';

import { recordingLogger } from '../../contracts/test/fakes/recording-logger.js';
import { deliverPending } from './delivery-pass.js';
import type { NotificationStore } from './notification-store.js';
import type { OutboxStore } from './outbox-store.js';
import type { EventBus } from './redis-event-bus.js';

function anEvent(id: string): DomainEvent {
    return {
        id,
        name: ITEM_CREATED_V1,
        occurredAt: '2026-09-11T10:00:00.000Z',
        payload: {
            itemId: '01931f3a-0000-7000-8000-000000000002',
            ownerId: '00000000-0000-7000-8000-000000000001',
        },
    };
}

function fakeOutbox(seed: DomainEvent[]): OutboxStore {
    const pending = [...seed];

    return {
        unpublished: limit => Promise.resolve(pending.slice(0, limit)),
        markPublished: ids => {
            for (const id of ids) {
                const index = pending.findIndex(event => event.id === id);
                if (index !== -1) pending.splice(index, 1);
            }
            return Promise.resolve();
        },
    };
}

// A real queue, not a mock: what is published must come out through take, and a call counter would
// not say whether the pass loops on the same event.
function fakeBus(): EventBus & { prises: number } {
    const queue: DomainEvent[] = [];
    const bus = {
        prises: 0,
        connect: () => Promise.resolve(),
        disconnect: () => Promise.resolve(),
        publish: (event: DomainEvent) => {
            queue.push(event);
            return Promise.resolve();
        },
        take: () => {
            bus.prises += 1;
            return Promise.resolve(queue.shift() ?? null);
        },
        depth: () => Promise.resolve(queue.length),
    };

    return bus;
}

function fakeNotifications(): NotificationStore & { notifies: string[] } {
    const notifies: string[] = [];

    return {
        notifies,
        notifyItemCreated: (eventId: string) => {
            notifies.push(eventId);
            return Promise.resolve(true);
        },
    } as unknown as NotificationStore & { notifies: string[] };
}

describe('deliverPending', () => {
    it('publishes what the outbox holds and then consumes it', async () => {
        const notifications = fakeNotifications();

        const result = await deliverPending({
            outbox: fakeOutbox([anEvent('event-1'), anEvent('event-2')]),
            bus: fakeBus(),
            notifications,
            logger: recordingLogger(),
        });

        expect(result).toEqual({ published: 2, consumed: 2, failed: 0 });
        expect(notifications.notifies).toEqual(['event-1', 'event-2']);
    });

    // What matters for a target without a long-running process: the pass runs in a request somebody
    // is waiting for, and take() blocks on an empty queue.
    it('takes nothing when the queue is empty, rather than waiting', async () => {
        const bus = fakeBus();

        const result = await deliverPending({
            outbox: fakeOutbox([]),
            bus,
            notifications: fakeNotifications(),
            logger: recordingLogger(),
        });

        expect(result).toEqual({ published: 0, consumed: 0, failed: 0 });
        expect(bus.prises).toBe(0);
    });

    // The defect measured on the deployment: a task deleted since made its notification fail on a
    // foreign key, and that single error aborted the pass -- ten valid events stayed stuck behind
    // it.
    it('carries on after an inapplicable event', async () => {
        const notifications = fakeNotifications();
        let appels = 0;
        notifications.notifyItemCreated = () => {
            appels += 1;
            if (appels === 1) return Promise.reject(new Error('cle etrangere violee'));
            return Promise.resolve(true);
        };

        const result = await deliverPending({
            outbox: fakeOutbox([anEvent('casse'), anEvent('valide')]),
            bus: fakeBus(),
            notifications,
            logger: recordingLogger(),
        });

        expect(result).toEqual({ published: 2, consumed: 1, failed: 1 });
    });

    it('stops at its event budget', async () => {
        const evenements = [anEvent('a'), anEvent('b'), anEvent('c')];

        const result = await deliverPending({
            outbox: fakeOutbox(evenements),
            bus: fakeBus(),
            notifications: fakeNotifications(),
            logger: recordingLogger(),
            maxEvents: 2,
        });

        // The third stays in the queue: the next pass will take it.
        expect(result).toEqual({ published: 3, consumed: 2, failed: 0 });
    });
});
