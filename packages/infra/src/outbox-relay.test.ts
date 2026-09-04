import { describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1 } from '@legacy/contracts';
import type { DomainEvent } from '@legacy/contracts';

import { relayOnce } from './outbox-relay.js';
import type { EventBus } from './redis-event-bus.js';
import type { OutboxStore } from './outbox-store.js';
import { recordingLogger } from '../test/fakes/recording-logger.js';

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

// Un faux qui se comporte comme une outbox : ce qui est marque publie ne
// ressort plus. Un mock qui compte les appels ne dirait pas si le relais
// republie eternellement le meme evenement.
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
    it('publie ce que l outbox contient et ne le represente plus ensuite', async () => {
        const outbox = fakeOutbox([anEvent('event-1', '2026-09-04T10:00:00.000Z')]);
        const bus = fakeBus();

        expect(await relayOnce({ outbox, bus, logger: recordingLogger() })).toBe(1);
        expect(bus.published.map(event => event.id)).toEqual(['event-1']);

        // Deuxieme passage : plus rien a publier, donc aucun doublon.
        expect(await relayOnce({ outbox, bus, logger: recordingLogger() })).toBe(0);
        expect(bus.published).toHaveLength(1);
    });

    it('respecte l ordre des faits', async () => {
        const outbox = fakeOutbox([
            anEvent('event-1', '2026-09-04T10:00:00.000Z'),
            anEvent('event-2', '2026-09-04T10:00:01.000Z'),
        ]);
        const bus = fakeBus();

        await relayOnce({ outbox, bus, logger: recordingLogger() });

        expect(bus.published.map(event => event.id)).toEqual(['event-1', 'event-2']);
    });

    // Un evenement non publie doit rester en attente : le perdre serait
    // definitif, alors qu une double livraison est absorbee par le consommateur.
    it('garde en attente ce qui n a pas pu partir, et s arrete la', async () => {
        const outbox = fakeOutbox([
            anEvent('event-1', '2026-09-04T10:00:00.000Z'),
            anEvent('event-2', '2026-09-04T10:00:01.000Z'),
            anEvent('event-3', '2026-09-04T10:00:02.000Z'),
        ]);
        const bus = fakeBus('event-2');

        expect(await relayOnce({ outbox, bus, logger: recordingLogger() })).toBe(1);
        expect(bus.published.map(event => event.id)).toEqual(['event-1']);
        // event-3 n est pas passe devant event-2 : l ordre est preserve.
        expect(outbox.pending.map(event => event.id)).toEqual(['event-2', 'event-3']);
    });

    it('ne journalise jamais le contenu d un evenement', async () => {
        const outbox = fakeOutbox([anEvent('event-1', '2026-09-04T10:00:00.000Z')]);
        const logger = recordingLogger();

        await relayOnce({ outbox, bus: fakeBus(), logger });

        expect(JSON.stringify(logger.lines)).not.toContain('01931f3a-0000-7000-8000-000000000002');
    });
});
