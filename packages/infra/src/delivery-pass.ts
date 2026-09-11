import type { Logger } from '@legacy/contracts';

import { consume } from './event-consumer.js';
import type { NotificationStore } from './notification-store.js';
import type { OutboxStore } from './outbox-store.js';
import { relayOnce } from './outbox-relay.js';
import type { EventBus } from './redis-event-bus.js';

// One pass of the whole flow: what the outbox holds goes to the broker, and
// what the broker holds becomes notifications.
//
// The relay runs on a timer in a process that stays up. A serverless function
// has no such process, so on that target the pass has to be asked for -- by the
// scheduled workflow, and by somebody opening their notifications.
export interface DeliveryPassDependencies {
    outbox: OutboxStore;
    bus: EventBus;
    notifications: NotificationStore;
    logger: Logger;
    maxEvents?: number;
}

export interface DeliveryPassResult {
    published: number;
    consumed: number;
    failed: number;
}

export async function deliverPending({
    outbox,
    bus,
    notifications,
    logger,
    maxEvents = 50,
}: DeliveryPassDependencies): Promise<DeliveryPassResult> {
    const published = await relayOnce({ outbox, bus, logger });

    let consumed = 0;
    let failed = 0;

    while (consumed + failed < maxEvents) {
        // depth() first: take() blocks for its timeout on an empty queue, and
        // this pass runs inside a request somebody is waiting on.
        if ((await bus.depth()) === 0) break;

        const event = await bus.take(1);
        if (event === null) break;

        try {
            await consume(event, { notifications, logger });
            consumed += 1;
        } catch (error) {
            // The event has already left the queue, and one it cannot apply
            // must not stop the ones behind it: a task deleted since blocked
            // ten valid events on the deployment. Losing it is the trade-off
            // ADR-0007 recorded, and EN-35 closes with a dead-letter queue.
            failed += 1;
            logger.error({ err: error, eventId: event.id }, 'event could not be applied');
        }
    }

    return { published, consumed, failed };
}
