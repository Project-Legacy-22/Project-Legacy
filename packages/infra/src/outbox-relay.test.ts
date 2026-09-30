import { describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1 } from '@legacy/contracts';
import type { DomainEvent } from '@legacy/contracts';

import { relayOnce } from './outbox-relay.js';
import type { EventBus } from './redis-event-bus.js';
import type { OutboxStore } from './outbox-store.js';
import { recordingLogger } from '../../contracts/test/fakes/recording-logger.js';

function anEvent(id: string, occurredAt: string): DomainEvent {
    return {
        id,
        name: ITEM_CREATED_V1,
        occurredAt,
        payload: {
            itemId: '01931f3a-0000-7000-8000-000000000002',
            ownerId: '00000000-0000-7000-8000-000000000001',
        },
    };
}

// A fake that behaves like an outbox: what is marked published does not come out again. A mock
// counting calls would not say whether the relay republishes the same event for ever.
function fakeOutbox(seed: DomainEvent[]): OutboxStore & { pending: DomainEvent[] } {
    const pending = [...seed];

    return {
        pending,
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

function fakeBus(failOn?: string): EventBus & { published: DomainEvent[] } {
    const published: DomainEvent[] = [];

    return {
        published,
        connect: () => Promise.resolve(),
        disconnect: () => Promise.resolve(),
        publish: event => {
            if (event.id === failOn) return Promise.reject(new Error('broker unavailable'));
            published.push(event);
            return Promise.resolve();
        },
        take: () => Promise.resolve(null),
        depth: () => Promise.resolve(published.length),
    };
}

describe('relayOnce', () => {
    it('publishes what the outbox holds and no longer presents it afterwards', async () => {
        const outbox = fakeOutbox([anEvent('event-1', '2026-09-04T10:00:00.000Z')]);
        const bus = fakeBus();

        expect(await relayOnce({ outbox, bus, logger: recordingLogger() })).toBe(1);
        expect(bus.published.map(event => event.id)).toEqual(['event-1']);

        // Second pass: nothing left to publish, so no duplicate.
        expect(await relayOnce({ outbox, bus, logger: recordingLogger() })).toBe(0);
        expect(bus.published).toHaveLength(1);
    });

    it('respects the order of the facts', async () => {
        const outbox = fakeOutbox([
            anEvent('event-1', '2026-09-04T10:00:00.000Z'),
            anEvent('event-2', '2026-09-04T10:00:01.000Z'),
        ]);
        const bus = fakeBus();

        await relayOnce({ outbox, bus, logger: recordingLogger() });

        expect(bus.published.map(event => event.id)).toEqual(['event-1', 'event-2']);
    });

    // An unpublished event must stay pending: losing it would be final, whereas a double delivery
    // is absorbed by the consumer.
    it('keeps pending what could not leave, and stops there', async () => {
        const outbox = fakeOutbox([
            anEvent('event-1', '2026-09-04T10:00:00.000Z'),
            anEvent('event-2', '2026-09-04T10:00:01.000Z'),
            anEvent('event-3', '2026-09-04T10:00:02.000Z'),
        ]);
        const bus = fakeBus('event-2');

        expect(await relayOnce({ outbox, bus, logger: recordingLogger() })).toBe(1);
        expect(bus.published.map(event => event.id)).toEqual(['event-1']);
        // event-3 did not overtake event-2: the order is preserved.
        expect(outbox.pending.map(event => event.id)).toEqual(['event-2', 'event-3']);
    });

    it('never logs the content of an event', async () => {
        const outbox = fakeOutbox([anEvent('event-1', '2026-09-04T10:00:00.000Z')]);
        const logger = recordingLogger();

        await relayOnce({ outbox, bus: fakeBus(), logger });

        expect(JSON.stringify(logger.lines)).not.toContain('01931f3a-0000-7000-8000-000000000002');
        expect(logger.lines.find(line => line.message === 'event published')?.fields)
            .toEqual({ eventId: 'event-1' });
    });
});
