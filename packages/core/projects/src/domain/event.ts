// The events the project domain produces. The domain owns its own event shape
// and imports nothing to describe it: `packages/contracts` carries the schema
// that validates the same shape at the boundary. Two declarations of one
// contract is the price of a domain that depends on nothing, and the test suite
// of each side pins them to the same fields -- the same arrangement the item
// domain already uses.

// `<domaine>.<fait>.v<n>`, deux segments et un participe passe : la convention
// de docs/events/catalog.md, que la contrainte outbox_name_format_chk fait
// respecter en base. Un premier essai nomme `project.member.added.v1` a ete
// refuse par cette contrainte -- trois segments -- et c est le bon refus : le
// fait qui se produit est qu une appartenance a ete creee.
export const MEMBERSHIP_CREATED_V1 = 'membership.created.v1';

export interface MembershipCreatedV1 {
    id: string;
    name: typeof MEMBERSHIP_CREATED_V1;
    occurredAt: string;
    payload: {
        projectId: string;
        memberId: string;
        // Who added them. This is what lets the notification say « added by »
        // rather than « added », which is the whole point of routing the
        // invitation through the event flow.
        addedBy: string;
    };
}

export type DomainEvent = MembershipCreatedV1;

// Builds the event announcing a member joining a project.
//
// The identifier and the instant are passed in rather than produced here, for
// the same reason the use cases take an id generator: a factory that calls
// `crypto.randomUUID()` and `new Date()` cannot be asserted on.
//
// The payload carries three identifiers and no address. The address is what
// the person typed to find the account, so it is content, and an event is the
// one place it must not travel: it would reach the broker and the consumer's
// logs, outside what the export and erasure paths can reach. A consumer that
// needs to name someone reads the address back from the component that owns it.
export function membershipCreated(
    eventId: string,
    occurredAt: Date,
    addition: { projectId: string; memberId: string; addedBy: string },
): MembershipCreatedV1 {
    return {
        id: eventId,
        name: MEMBERSHIP_CREATED_V1,
        occurredAt: occurredAt.toISOString(),
        payload: {
            projectId: addition.projectId,
            memberId: addition.memberId,
            addedBy: addition.addedBy,
        },
    };
}
