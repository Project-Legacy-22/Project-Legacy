# ADR-0007 — Redis as the event broker

- **Status**: Accepted
- **Date**: 2026-09-02
- **Deciders**: whole team, kickoff meeting
- **Related issue**: #2

## Context

The subject requires **at least one complete and demonstrable event-driven workflow**, working
early. It is one of the points examined at the intermediate review, and there is nothing in the
legacy code to build on.

ADR-0001 gives the events a real recipient: without shared projects, notifying would mean
notifying oneself.

## Options considered

### Option A — In-process bus behind an interface, with an outbox table
- Pros: nothing more to operate; reliability is ensured by the database, in the same transaction
  as the business write; replaceable later without touching the domain.
- Cons: the decoupling is not observable from outside the process — hard to demonstrate other
  than by showing code.
- It was the recommendation of the backlog (`D-09`).

### Option B — External broker, Redis
- Pros: the decoupling becomes observable — we stop the consumer, the queue builds up, we restart
  it, it drains. It is a demonstration, not an explanation.
- Cons: one more service to run locally, in CI and at runtime; publishing leaves the database
  transaction.

### Option C — RabbitMQ
- Discarded: the additional guarantees serve no purpose here, for a much heavier operation.

## Decision

We choose **option B — an external broker, Redis**, against the recommendation of the backlog.

Because:

1. The event-driven architecture is graded and demonstrated at review. An in-process bus is
   described; a consumer stopped and restarted in front of the jury is shown.
2. Redis is the cheapest broker to operate, and Docker was already required by ADR-0004 and by
   the deliverable image: it introduces no new prerequisite on the workstations.
3. A separate `worker`, consuming the events, makes the decoupling visible in the repository tree
   as much as at runtime.

## Consequences

**Positive**
- The event flow can be demonstrated without reading code.
- The consumer is a distinct process: a failure of the worker does not bring the API down, which
  is exactly the property we want to show.

**Negative / accepted debt**
- One more service in the local composition (`EN-03`), in the image (`EN-08`) and, when the time
  comes, in CI.
- **Reliability is not provided by the broker.** Publishing to Redis from the code that has just
  written to the database reintroduces precisely the problem the outbox table solved: if the
  transaction fails after the publication, the event exists without the fact it announces. The
  broker is a transport, not a guarantee of atomicity.

**What it imposes on the rest of the project**
- The domains publish on an **interface**, never on the Redis client: this is what makes this
  decision reversible (ADR-0003).
- `EN-35` must decide a point the meeting did not decide: either keep the outbox table with Redis
  as the transport, or explicitly accept that an event can be lost. **To be decided at the
  sprint 2 planning**, before writing the first producer.
- The visible effect that serves as the demonstration was not agreed either. The proposal of the
  backlog — "creating a task produces a visible notification" — remains to be confirmed. Without
  an observable effect, the demonstration proves nothing.

## How we will know we were wrong

If at the intermediate review the broker brings nothing more than an in-process bus — no truly
separate worker, no observable recovery — while it costs a service locally, in CI and in the
image, we go back to the in-process implementation. The domains do not change: only the adapter
behind the interface is replaced.

## References

- `docs/backlog.md`, decision `D-09`
- `US-10`, `US-18`, `EN-35`
- Team standards, `standards/01-architecture.md`, section 3
