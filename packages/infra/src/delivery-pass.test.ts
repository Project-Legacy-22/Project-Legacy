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

// Une vraie file, pas un mock : ce qui est publie doit ressortir par take, et un
// compteur d appels ne dirait pas si la passe boucle sur le meme evenement.
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
    it('publie ce que l outbox retient puis le consomme', async () => {
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

    // Le point qui compte pour une cible sans processus long : la passe tourne
    // dans une requete que quelqu un attend, et take() bloque sur une file vide.
    it('ne prend rien quand la file est vide, plutot que d attendre', async () => {
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

    // Le defaut mesure sur le deploiement : une tache supprimee depuis faisait
    // echouer sa notification sur une cle etrangere, et cette seule erreur
    // faisait avorter la passe -- dix evenements valides restaient bloques
    // derriere elle.
    it('continue apres un evenement inapplicable', async () => {
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

    it('s arrete a son budget d evenements', async () => {
        const evenements = [anEvent('a'), anEvent('b'), anEvent('c')];

        const result = await deliverPending({
            outbox: fakeOutbox(evenements),
            bus: fakeBus(),
            notifications: fakeNotifications(),
            logger: recordingLogger(),
            maxEvents: 2,
        });

        // Le troisieme reste dans la file : la passe suivante le prendra.
        expect(result).toEqual({ published: 3, consumed: 2, failed: 0 });
    });
});
