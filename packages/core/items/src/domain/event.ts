// The events the item domain produces. The domain owns its own event shape and
// imports nothing to describe it: `packages/contracts` carries the schema that
// validates the same shape at the boundary, for the producer that serialises it
// and the consumer that reads it back. Two declarations of one contract is the
// price of a domain that depends on nothing; the test suite of each side pins
// them to the same fields.

import type { Item } from './item.js';

export const ITEM_CREATED_V1 = 'item.created.v1';

export interface ItemCreatedV1 {
    id: string;
    name: typeof ITEM_CREATED_V1;
    occurredAt: string;
    payload: {
        itemId: string;
        ownerId: string;
    };
}

export type DomainEvent = ItemCreatedV1;

// Builds the event announcing a created item.
//
// The identifier and the instant are passed in rather than produced here, for
// the same reason the use cases take an id generator: a factory that calls
// `crypto.randomUUID()` and `new Date()` cannot be asserted on.
//
// The payload deliberately omits `item.name`. It is content the user typed, so
// it is personal data, and an event is the one place it must not travel: it
// would end up in the broker and in the consumer's logs, outside the reach of
// the export and erasure paths. A consumer that needs the name reads it back
// from the component that owns it.
export function itemCreated(eventId: string, occurredAt: Date, item: Item): ItemCreatedV1 {
    return {
        id: eventId,
        name: ITEM_CREATED_V1,
        occurredAt: occurredAt.toISOString(),
        payload: {
            itemId: item.id,
            ownerId: item.ownerId,
        },
    };
}
