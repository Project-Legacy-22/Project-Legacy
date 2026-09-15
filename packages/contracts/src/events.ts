import { z } from 'zod';

// The event contract shared by the producer and the consumer. Both validate
// against these schemas, so a payload whose shape drifts fails at the boundary
// instead of halfway through a handler, on the other side of a broker.
//
// The version belongs to the name rather than to a separate field: a consumer
// subscribes to `item.created.v1` and keeps working the day `item.created.v2`
// is published alongside it. A numeric field would force every consumer to
// branch on it before knowing whether it can read the payload at all.
export const ITEM_CREATED_V1 = 'item.created.v1';

// No content crosses the bus. The item name is what the user typed; it stays
// in the database, and a consumer that needs it reads it back through the
// owning component. An event carries identifiers and nothing else.
//
// « No content » is not « nothing personal », and the difference is not
// pedantry: ownerId is a pseudonymous identifier, and recital 26 of the GDPR
// keeps pseudonymised data personal as long as the controller can re-identify
// -- which we can, since users.id leads to an address. The broker is therefore
// a recipient of personal data and is declared as one in the register and in
// the privacy policy. It was not, for as long as this comment said otherwise.
//
// The schema is strict on purpose: adding a field to a published payload then
// fails loudly here, instead of being silently stripped and lost between the
// producer and the consumer.
export const ItemCreatedV1Payload = z.strictObject({
    itemId: z.uuid(),
    ownerId: z.uuid(),
});

export const ItemCreatedV1 = z.strictObject({
    // Assigned by the producer and stable across republication: this is the key
    // a consumer records to recognise an event it has already handled, which is
    // what makes delivering the same event twice a no-op.
    id: z.uuid(),
    name: z.literal(ITEM_CREATED_V1),
    occurredAt: z.iso.datetime(),
    payload: ItemCreatedV1Payload,
});

// Discriminated on the name so a second event type is added here without
// touching the consumers of the first.
export const DomainEvent = z.discriminatedUnion('name', [ItemCreatedV1]);

export type ItemCreatedV1Payload = z.infer<typeof ItemCreatedV1Payload>;
export type ItemCreatedV1 = z.infer<typeof ItemCreatedV1>;
export type DomainEvent = z.infer<typeof DomainEvent>;
