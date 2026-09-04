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
    it('accepte une enveloppe conforme', () => {
        expect(ItemCreatedV1.parse(VALID_EVENT)).toEqual(VALID_EVENT);
    });

    it('porte sa version dans le nom, pour qu un consommateur s abonne a une forme precise', () => {
        expect(ITEM_CREATED_V1).toBe('item.created.v1');
        expect(() => ItemCreatedV1.parse({ ...VALID_EVENT, name: 'item.created' })).toThrow();
    });

    it('refuse une date d occurrence qui n est pas un instant ISO', () => {
        expect(() => ItemCreatedV1.parse({ ...VALID_EVENT, occurredAt: '2026-09-03' })).toThrow();
    });
});

describe('ItemCreatedV1Payload', () => {
    // Le critere RGPD de US-10 : un evenement ne transporte que des
    // identifiants. Le nom de l item est du contenu saisi par l utilisateur ;
    // s il pouvait passer, il se retrouverait dans le broker et dans les
    // journaux du consommateur.
    it('rejette un payload qui transporte le nom de l item', () => {
        expect(() =>
            ItemCreatedV1Payload.parse({
                itemId: VALID_EVENT.payload.itemId,
                ownerId: VALID_EVENT.payload.ownerId,
                name: 'Acheter du lait',
            }),
        ).toThrow();
    });

    it('rejette un identifiant qui n est pas un uuid', () => {
        expect(() =>
            ItemCreatedV1Payload.parse({
                itemId: 'not-a-uuid',
                ownerId: VALID_EVENT.payload.ownerId,
            }),
        ).toThrow();
    });
});

describe('DomainEvent', () => {
    it('resout une enveloppe vers le schema designe par son nom', () => {
        expect(DomainEvent.parse(VALID_EVENT)).toEqual(VALID_EVENT);
    });

    it('rejette un nom d evenement inconnu', () => {
        expect(() => DomainEvent.parse({ ...VALID_EVENT, name: 'item.archived.v1' })).toThrow();
    });
});
