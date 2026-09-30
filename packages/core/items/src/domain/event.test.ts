import { describe, expect, it } from 'vitest';

import { ITEM_CREATED_V1, itemCreated } from './event.js';
import { createItem } from './item.js';

const OWNER_ID = '00000000-0000-7000-8000-000000000001';
const OCCURRED_AT = new Date('2026-09-03T10:00:00.000Z');

describe('itemCreated', () => {
    it('announces the created item with the given identifier and instant', () => {
        const item = createItem({
            id: 'item-id',
            name: 'Acheter du lait',
            projectId: 'project-id',
            ownerId: OWNER_ID,
        });

        const event = itemCreated({ eventId: 'event-id', occurredAt: OCCURRED_AT, item, ownerId: OWNER_ID });

        expect(event).toEqual({
            id: 'event-id',
            name: ITEM_CREATED_V1,
            occurredAt: '2026-09-03T10:00:00.000Z',
            payload: { itemId: 'item-id', ownerId: OWNER_ID },
        });
    });

    // The GDPR criterion of US-10. The name is content typed by the user: if it entered the
    // payload, it would leave the scope that export and erasure know how to reach.
    it('does not carry the item name', () => {
        const item = createItem({
            id: 'item-id',
            name: 'Rendez-vous medical',
            projectId: 'project-id',
            ownerId: OWNER_ID,
        });

        const event = itemCreated({ eventId: 'event-id', occurredAt: OCCURRED_AT, item, ownerId: OWNER_ID });

        expect(Object.keys(event.payload)).toEqual(['itemId', 'ownerId']);
        expect(JSON.stringify(event)).not.toContain('Rendez-vous medical');
    });

    it('carries a versioned name, so that a consumer subscribes to a precise shape', () => {
        const item = createItem({
            id: 'item-id',
            name: 'Acheter du lait',
            projectId: 'project-id',
            ownerId: OWNER_ID,
        });

        const event = itemCreated({ eventId: 'event-id', occurredAt: OCCURRED_AT, item, ownerId: OWNER_ID });

        expect(event.name).toBe('item.created.v1');
    });
});
