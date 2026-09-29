# ADR-0013 — The outbox is the guarantee, and the notification is the demonstrable effect

- **Status**: Accepted
- **Date**: 2026-09-11
- **Deciders**: team, at the sprint 2 review
- **Related issue**: #228, extends ADR-0007

## Context

ADR-0007 chose an external broker without ruling on what guarantees that a published event matches
a fact actually written. Its consequences leave the choice open: "either keep the outbox table
with Redis as the transport, or explicitly accept that an event can be lost".

The code has decided by itself since then. As of 11 September 2026: the `outbox` table is written
in the same transaction as the task (`create_item_with_event`), a relay drains it to Redis,
`processed_events` absorbs a replay, and the purge is documented in the register of processing
activities. The question remained open in the repository while it was closed in the schema.

The subject also asks for "at least one demonstrable event flow", without saying which.

## Options considered

### Option A — Keep the outbox, Redis as the transport
- Pros: a published event always matches a written fact, since both writes share a transaction.
  An unavailable broker delays delivery without losing it.
- Cons: one more table, a relay to run, and an at-least-once delivery that forces the consumer to
  be idempotent.

### Option B — Publish directly, loss accepted
- Pros: neither table nor relay.
- Cons: a broker failure between the write and the publication loses the event permanently, and
  nothing tells which one.

## Decision

We choose **option A**, and we name the demonstrable effect: **creating a task produces a
notification visible to its recipient**.

Because the guarantee is already built and tested, and because the alternative makes a loss
invisible: nothing, in option B, says which event disappeared. The chosen effect is the one that
goes through the whole chain — write, outbox, broker, consumer, read — in a single observable
action.

## Consequences

**Positive**
- The consumer is idempotent by construction, `processed_events` being authoritative.
- The flow is demonstrated in one action: create a task, open the notifications.

**Negative / accepted debt**
- At-least-once delivery, never exactly once.
- An event the consumer cannot apply is lost: it has already left the queue. The dead-letter queue
  is the subject of `EN-35`.

**What it imposes on the rest of the project**
- Every event producer writes into the outbox within the transaction of the fact, never after.
- Every deployment target must run a relay pass. On a target without a long-running process, it
  is triggered by the write and swept by a scheduled call (#258).

## How we will know we were wrong

An outbox row left unpublished for longer than the sweep interval, without a broker failure to
explain it.

## References

- ADR-0007 (event mechanism), `docs/features/127-event-consumer-and-notifications.md`
- `docs/gdpr/registre.md`, processing of the events
