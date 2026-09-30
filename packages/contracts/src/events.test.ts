import { describe, expect, it } from 'vitest';

import { DomainEvent, ITEM_CREATED_V1, ItemCreatedV1, ItemCreatedV1Payload } from './events.js';

const VALID_EVENT = {
    id: '01931f3a-0000-7000-8000-000000000001',
    name: ITEM_CREATED_V1,
    occurredAt: '2026-09-03T10:00:00.000Z',
    payload: {
        itemId: '01931f3a-0000-7000-8000-000000000002',
        ownerId: '00000000-0000-7000-8000-000000000001',
    },
};

describe('ItemCreatedV1', () => {
    it('accepts a valid envelope', () => {
        expect(ItemCreatedV1.parse(VALID_EVENT)).toEqual(VALID_EVENT);
    });

    it('carries its version in its name, so that a consumer subscribes to a precise shape', () => {
        expect(ITEM_CREATED_V1).toBe('item.created.v1');
        expect(() => ItemCreatedV1.parse({ ...VALID_EVENT, name: 'item.created' })).toThrow();
    });

    it('refuses an occurrence date that is not an ISO instant', () => {
        expect(() => ItemCreatedV1.parse({ ...VALID_EVENT, occurredAt: '2026-09-03' })).toThrow();
    });
});

describe('ItemCreatedV1Payload', () => {
    // The GDPR criterion of US-10: an event carries identifiers only. The item name is content
    // typed by the user; if it could get through, it would end up in the broker and in the
    // consumer's logs.
    it('rejects a payload that carries the item name', () => {
        expect(() =>
            ItemCreatedV1Payload.parse({
                itemId: VALID_EVENT.payload.itemId,
                ownerId: VALID_EVENT.payload.ownerId,
                name: 'Acheter du lait',
            }),
        ).toThrow();
    });

    // What US-13 rests on the rule above: if a published payload can only carry identifiers, then
    // erasing an account has nothing to purge in a consumer or in the broker. The test states the
    // exact list of fields rather than trusting the rule: a field added to the schema fails here,
    // where it would be undetectable once the event is gone.
    it('carries identifiers only, so there is nothing to purge outside the database', () => {
        const payload = ItemCreatedV1Payload.parse(VALID_EVENT.payload);

        expect(Object.keys(payload).sort()).toEqual(['itemId', 'ownerId']);
    });

    it('rejects a payload that carries the owner\'s address', () => {
        expect(() =>
            ItemCreatedV1Payload.parse({ ...VALID_EVENT.payload, email: 'alice@example.com' }),
        ).toThrow();
    });

    it('rejects an identifier that is not a uuid', () => {
        expect(() =>
            ItemCreatedV1Payload.parse({
                itemId: 'not-a-uuid',
                ownerId: VALID_EVENT.payload.ownerId,
            }),
        ).toThrow();
    });
});

describe('DomainEvent', () => {
    it('resolves an envelope to the schema its name designates', () => {
        expect(DomainEvent.parse(VALID_EVENT)).toEqual(VALID_EVENT);
    });

    it('rejects an unknown event name', () => {
        expect(() => DomainEvent.parse({ ...VALID_EVENT, name: 'item.archived.v1' })).toThrow();
    });
});
