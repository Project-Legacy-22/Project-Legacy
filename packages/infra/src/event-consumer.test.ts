import { describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1 } from '@legacy/contracts';
import type { DomainEvent } from '@legacy/contracts';

import { consume } from './event-consumer.js';
import type { NotificationStore } from './notification-store.js';
import { recordingLogger } from '../test/fakes/recording-logger.js';

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
    itemId: string;
}

// Un vrai magasin en memoire, avec la meme regle d unicite que la base : la
// cle est l identifiant de l evenement. Un mock qui renverrait simplement
// `false` au second appel prouverait que le test sait compter, pas que le
// systeme est idempotent.
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
        countUnread: userId =>
            Promise.resolve(created.filter(notification => notification.userId === userId).length),
    };
}

describe('consume', () => {
    it('produit une notification pour le proprietaire de l item', async () => {
        const notifications = fakeNotifications();

        const outcome = await consume(EVENT, { notifications, logger: recordingLogger() });

        expect(outcome).toBe('applied');
        expect(notifications.created).toEqual([
            { eventId: EVENT.id, userId: OWNER_ID, itemId: ITEM_ID },
        ]);
        expect(await notifications.countUnread(OWNER_ID)).toBe(1);
    });

    // Le critere de US-10 : rejouer deux fois le meme evenement laisse le
    // systeme dans le meme etat. Le relais republie ce qu il n a pas pu marquer,
    // donc une double livraison n est pas une hypothese d ecole.
    it('laisse le meme etat quand le meme evenement est rejoue', async () => {
        const notifications = fakeNotifications();
        const logger = recordingLogger();

        const first = await consume(EVENT, { notifications, logger });
        const second = await consume(EVENT, { notifications, logger });

        expect(first).toBe('applied');
        expect(second).toBe('alreadyHandled');
        expect(notifications.created).toHaveLength(1);
        expect(await notifications.countUnread(OWNER_ID)).toBe(1);
    });

    it('traite deux evenements distincts comme deux faits', async () => {
        const notifications = fakeNotifications();
        const other: DomainEvent = { ...EVENT, id: '01931f3a-0000-7000-8000-000000000009' };

        await consume(EVENT, { notifications, logger: recordingLogger() });
        await consume(other, { notifications, logger: recordingLogger() });

        expect(notifications.created).toHaveLength(2);
    });

    it('ne journalise que des identifiants', async () => {
        const notifications = fakeNotifications();
        const logger = recordingLogger();

        await consume(EVENT, { notifications, logger });

        const written = JSON.stringify(logger.lines);
        expect(written).toContain(EVENT.id);
        expect(written).not.toContain(ITEM_ID);
    });
});
