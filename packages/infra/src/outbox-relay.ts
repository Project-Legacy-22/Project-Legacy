import type { Logger } from '@legacy/contracts';

import type { EventBus } from './redis-event-bus.js';
import type { OutboxStore } from './outbox-store.js';

export interface RelayDependencies {
    outbox: OutboxStore;
    bus: EventBus;
    logger: Logger;
    batchSize?: number;
}

// Moves what the outbox holds to the broker. It is the only place that turns a
// stored fact into a published one.
//
// Publishing happens before the row is marked, never after: if the process dies
// in between, the event is delivered twice, which the consumer is built to
// absorb. Marking first would risk losing it entirely, and a lost event is not
// recoverable from anywhere.
export async function relayOnce({
    outbox,
    bus,
    logger,
    batchSize = 50,
}: RelayDependencies): Promise<number> {
    const events = await outbox.unpublished(batchSize);
    if (events.length === 0) return 0;

    const published: string[] = [];

    for (const event of events) {
        try {
            await bus.publish(event);
            published.push(event.id);
        } catch (error) {
            // Stop at the first failure rather than skipping ahead: the events
            // after this one are more recent, and delivering them first would
            // hand the consumer facts out of order. What is not marked is
            // retried on the next pass.
            logger.warn({ err: error, eventId: event.id }, 'event not published, will be retried');
            break;
        }
    }

    await outbox.markPublished(published);

    // The identifier is logged, never the payload: an event carries no personal
    // data, but a log line that prints whole payloads becomes the exception the
    // day one does.
    if (published.length > 0) logger.info({ count: published.length }, 'events published');

    return published.length;
}
