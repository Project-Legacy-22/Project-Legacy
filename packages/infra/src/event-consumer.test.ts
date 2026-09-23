import { describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1, MEMBERSHIP_CREATED_V1 } from '@legacy/contracts';
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
    // L une ou l autre, jamais les deux : la contrainte notifications_kind_chk
    // refuse une ligne qui nommerait une tache et un projet.
    itemId?: string;
    projectId?: string;
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
        // Le meme ensemble `handled`, deliberement : processed_events porte une
        // ligne par evenement, quel que soit le genre de la notification. Deux
        // ensembles separes laisseraient passer un rejeu croise.
        notifyMemberAdded: (eventId, userId, projectId) => {
            if (handled.has(eventId)) return Promise.resolve(false);
            handled.add(eventId);
            created.push({ eventId, userId, projectId });
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

const PROJET_ID = '01931f3a-0000-7000-8000-000000000010';
const MEMBRE_ID = '00000000-0000-7000-8000-000000000011';
const AJOUTE_PAR = '00000000-0000-7000-8000-000000000012';

const EVENT_APPARTENANCE: DomainEvent = {
    id: '01931f3a-0000-7000-8000-000000000020',
    name: MEMBERSHIP_CREATED_V1,
    occurredAt: '2026-09-15T10:00:00.000Z',
    payload: { projectId: PROJET_ID, memberId: MEMBRE_ID, addedBy: AJOUTE_PAR },
};

describe('consume, une appartenance creee', () => {
    it('notifie la personne ajoutee, et elle seule', async () => {
        const notifications = fakeNotifications();

        const outcome = await consume(EVENT_APPARTENANCE, {
            notifications,
            logger: recordingLogger(),
        });

        expect(outcome).toBe('applied');
        expect(notifications.created).toEqual([
            { eventId: EVENT_APPARTENANCE.id, userId: MEMBRE_ID, projectId: PROJET_ID },
        ]);
        // Celle qui ajoute sait ce qu elle vient de faire : la lui annoncer
        // serait du bruit, et une notification de plus a effacer.
        expect(notifications.created.map(n => n.userId)).not.toContain(AJOUTE_PAR);
    });

    it('ne notifie pas deux fois a la redelivrance', async () => {
        const notifications = fakeNotifications();

        await consume(EVENT_APPARTENANCE, { notifications, logger: recordingLogger() });
        const second = await consume(EVENT_APPARTENANCE, {
            notifications,
            logger: recordingLogger(),
        });

        expect(second).toBe('alreadyHandled');
        expect(notifications.created).toHaveLength(1);
    });

    // La propriete qu on oublie : processed_events porte une ligne par
    // evenement, pas une par genre. Deux registres separes laisseraient un
    // rejeu croise produire deux effets pour un seul identifiant.
    it('partage le registre des evenements traites avec les autres genres', async () => {
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

// Les deux ecritures du consommateur -- la reservation et la notification --
// sont desormais faites par une seule fonction de base de donnees. Le faux
// ci-dessous se comporte comme elle : ou les deux existent, ou aucune. Un faux
// qui les separerait laisserait passer le defaut que la revue a trouve.
describe('consume, atomicite de l effet', () => {
    it('ne marque pas un evenement traite quand la notification n a pas pu etre creee', async () => {
        const notifications: NotificationStore = {
            notifyItemCreated: () => Promise.reject(new Error('notifications: notify failed')),
            notifyMemberAdded: () => Promise.reject(new Error('notifications: notify failed')),
            countUnread: () => Promise.resolve(0),
            findPageForAccount: () => Promise.reject(new Error('not exercised by this suite')),
            markAsRead: () => Promise.reject(new Error('not exercised by this suite')),
        };

        await expect(
            consume(EVENT, { notifications, logger: recordingLogger() }),
        ).rejects.toThrow(/notify failed/);
    });

    // Consequence directe : une redelivraison apres un echec doit encore avoir
    // du travail. Si la reservation avait survecu a l echec, celle-ci
    // repondrait "deja traite" et l effet serait perdu pour toujours.
    it('applique l effet a la redelivraison qui suit un echec', async () => {
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
