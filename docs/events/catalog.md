# Event catalogue

Reference of the events published by the application. An event that is not described here is not
allowed to be published: the catalogue is what lets a consumer know what it receives without
reading the code of the producer.

The executable contract is `packages/contracts/src/events.ts`. This document explains the rules
and the intent; the schema is authoritative on the form.

## Rules

**The name carries the version.** An event is called `<domain>.<fact>.v<n>`, for example
`item.created.v1`. The version is in the name and not in a separate field: a consumer subscribes to
a precise form and keeps working the day `item.created.v2` is published next to it. A numeric field
would force every consumer to branch on it before even knowing whether it can read the payload.

**An event describes a past fact.** It is named in the past participle and is never an order. A
consumer decides what it does with it; the producer expects nothing in return.

**No personal data travels.** The payload only carries identifiers and what is strictly necessary.
The name of an item is content entered by the user: it stays in the database, and a consumer that
needs it reads it back from the component that holds it. This rule is what keeps the export and the
erasure (`US-13`) under control, and it prevents personal data from ending up in a consumer log.
The payload schema is strict: adding a field fails validation instead of being silently ignored.

**A duplicate delivery changes nothing.** A consumer can receive the same event twice. The envelope
identifier is stable from one republication to the next: it is the key a consumer records to
recognise what it has already handled.

## Envelope

| Field | Type | Role |
|---|---|---|
| `id` | uuid | Identity of the event, stable in case of republication. Idempotency key on the consumer side. |
| `name` | literal | Versioned name, for example `item.created.v1`. Discriminates the payload schema. |
| `occurredAt` | ISO 8601 instant | Date of the fact, not of the publication. |
| `payload` | strict object | Specific to each event, described below. |

## Events

### `item.created.v1`

An item was created.

| | |
|---|---|
| **Producer** | `apps/api`, use case `addItem` of `packages/core/items` |
| **Consumers** | `apps/worker` |
| **Expected effect** | an unread notification for the owner, visible in the session banner |
| **Status** | in service |

Payload:

| Field | Type | Why it is there |
|---|---|---|
| `itemId` | uuid | Designates the item concerned. A consumer that needs its content reads it back. |
| `ownerId` | uuid | Designates the recipient of the effect, without carrying their real identity. |

The name of the item is deliberately absent: it is user content.

### `membership.created.v1`

A membership of a project was created: somebody was added to a project.

| | |
|---|---|
| **Producer** | `apps/api`, use case `addProjectMember` of `packages/core/projects` |
| **Consumers** | `apps/worker` |
| **Expected effect** | an unread notification for the person added, saying by whom |
| **Status** | in preparation — the `add_member_with_event` function and the domain schema exist; the schema of `packages/contracts` and the branch of the consumer arrive with #359 |

Payload:

| Field | Type | Why it is there |
|---|---|---|
| `projectId` | uuid | Designates the project joined. A consumer that needs its name reads it back. |
| `memberId` | uuid | Designates the recipient of the effect, without carrying their real identity. |
| `addedBy` | uuid | Without it, the notification could say "added" but not "by whom", and that is the reason why the invitation goes through the flow. |

The address is deliberately absent: it is what the person typed to find the account, hence
content. A consumer that needs to name somebody reads the address back from the component that
holds it.

**Why the contracts schema is not there yet.** An event the consumer refuses is lost: the delivery
pass removes it from the queue without putting it back, which ADR-0007 accepts and which EN-35 will
close with a dead-letter queue. Publishing this name before the consumer knows how to write it as a
notification would therefore lose the invitations issued in between. Nothing emits it for now.

### `invitation.created.v1`

A person was invited into a project and has not answered yet (#401).

| | |
|---|---|
| **Producer** | `apps/api`, use case `inviteProjectMember` of `packages/core/projects`, through the `invite_member_with_event` function that writes the invitation and the event in the same transaction |
| **Consumers** | `apps/worker`, and the delivery pass of the API in a serverless deployment |
| **Expected effect** | an unread notification for the invited person, which carries the invitation and from which they accept or decline |
| **Status** | in service |

Payload:

| Field | Type | Why it is there |
|---|---|---|
| `invitationId` | uuid | Designates the invitation the notification allows answering. Its state is read back, never carried. |
| `projectId` | uuid | Designates the project offered. Its name is read back at display time. |
| `inviteeId` | uuid | Designates the recipient of the effect, without carrying their real identity. |
| `invitedBy` | uuid | Makes it possible to say who invites without carrying their address. |

The address entered by the person who invites is absent for the same reason as in
`membership.created.v1`. An invitation already present, or addressed to a member, emits nothing:
only an invitation actually created produces the event.

## Adding an event

1. Describe the schema in `packages/contracts/src/events.ts` and add it to the `DomainEvent`
   union.
2. Document here the producer, the consumers and the expected effect.
3. Cover with a test the fact that the payload carries no personal data.

Changing the form of an event already published is done by publishing a new version next to the old
one, never by modifying the existing one: a consumer may be reading it.

## Demonstrating the flow

Decoupling is better shown than explained: this is the reason why ADR-0007 chose an external broker
and a consumer in its own process.

`npm run up` starts the four stages, worker included. The sequence takes one minute.

1. Sign in, create a task. The notification count of the banner goes to 1 within a second or two:
   the API notified nothing itself, it only wrote the event in the same transaction as the task.
2. Stop the worker alone, then create two tasks. The count no longer moves. The queue builds up,
   which can be read:

   ```bash
   docker compose exec redis redis-cli LLEN legacy22:events
   ```

3. Restart the worker: `npm run dev:worker`. The queue drains, the count catches up. Nothing was
   lost during the stop.

What the demonstration establishes: the API does not depend on the consumer to respond, a failure
of the consumer does not bring the API down, and the pending work survives its stop.

To show idempotency without waiting for a failure, republish an event already handled:

```bash
docker compose exec redis redis-cli LPUSH legacy22:events "$(...)"
```

The worker consumes it, logs `event already handled, nothing to do`, and the notification count does
not move: the primary key of `processed_events` refused the second reservation.
