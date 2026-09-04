import { describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1, itemCreated } from './event.js';
import { createItem } from './item.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OCCURRED_AT = new Date('2026-09-03T10:00:00.000Z');

describe('itemCreated', () => {
    it('annonce l item cree avec l identifiant et l instant fournis', () => {
        const item = createItem('item-id', 'Acheter du lait', OWNER_ID);

        expect(itemCreated('event-id', OCCURRED_AT, item)).toEqual({
            id: 'event-id',
            name: ITEM_CREATED_V1,
            occurredAt: '2026-09-03T10:00:00.000Z',
            payload: { itemId: 'item-id', ownerId: OWNER_ID },
        });
    });

    // Le critere RGPD de US-10. Le nom est du contenu saisi par l utilisateur :
    // s il entrait dans le payload, il sortirait du perimetre que l export et
    // l effacement savent atteindre.
    it('ne transporte pas le nom de l item', () => {
        const item = createItem('item-id', 'Rendez-vous medical', OWNER_ID);

        const event = itemCreated('event-id', OCCURRED_AT, item);

        expect(Object.keys(event.payload)).toEqual(['itemId', 'ownerId']);
        expect(JSON.stringify(event)).not.toContain('Rendez-vous medical');
    });

    it('porte un nom versionne, pour qu un consommateur s abonne a une forme precise', () => {
        const item = createItem('item-id', 'Acheter du lait', OWNER_ID);

        expect(itemCreated('event-id', OCCURRED_AT, item).name).toBe('item.created.v1');
    });
});
