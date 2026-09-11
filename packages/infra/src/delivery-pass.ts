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

    while (consumed < maxEvents) {
        // depth() first: take() blocks for its timeout on an empty queue, and
        // this pass runs inside a request somebody is waiting on.
        if ((await bus.depth()) === 0) break;

        const event = await bus.take(1);
        if (event === null) break;

        await consume(event, { notifications, logger });
        consumed += 1;
    }

    return { published, consumed };
}
