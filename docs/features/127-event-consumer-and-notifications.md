# Consume the events and show their effect

- **Issue**: #127
- **Epic**: Events
- **Delivered**: 2026-09-10
- **Decisions that apply**: ADR-0004, ADR-0005, ADR-0007

## What it does

Creating an item now has a visible consequence somewhere else: the session banner shows a
count of unread notifications, and it goes up a second or two after the item appears. Nothing
in the request that created the item produced that count. A separate process read the event,
decided what it meant, and wrote the notification.

That delay is the point. The API answers without waiting for the effect, and a consumer that
is down does not make the API fail — it makes the queue grow, and the effect arrives late
once the consumer is back.

Out of scope, deliberately: retrying an event whose handling failed, and a dead-letter queue
for one that never succeeds. ADR-0007 recorded that trade-off and EN-35 (#36) closes it.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `GET /notifications` | Unread count for the caller | session required |
| Session banner | Shows that count, refreshed on an interval | session required |

The response shape is `NotificationSummaryDto` in `packages/contracts`. A count rather than a
list: the screen shows a reminder, and a list would carry item identifiers it has no use for.

## Data

| Table | Written by | Read by |
|---|---|---|
| `outbox` | the item write, in its transaction | the relay |
| `processed_events` | the consumer | the consumer |
| `notifications` | the consumer | `GET /notifications` |

All three arrive with `20260904110000_outbox_and_notifications`. Claiming an event and
creating its notification happen inside `record_item_created_notification`, added by
`20260910090000_notify_in_one_transaction`: two statements were two transactions, and a claim
that outlived a failed insert made every later redelivery a no-op for an effect that had never
been applied.

A notification belongs to the account named by `user_id`. `GET /notifications` counts only
that account's rows; the caller is taken from the session, never from the request.

## Events

Consumes `item.created.v1`, described in [the catalogue](../events/catalog.md). A consumer may
rely on the payload carrying identifiers and nothing else: the item's name is not in it, by
contract and by test.

Delivering the same event twice leaves the same state. That is a property of the consumer, not
of the broker: the event identifier is the primary key of `processed_events`, so the second
delivery loses the claim and stops.

## Errors

| Situation | Response | Note |
|---|---|---|
| No session | `401` | Same as every other authenticated route |
| Broker unreachable during a relay pass | none, retried | The outbox still holds what was not published, so nothing is lost |
| Unreadable entry in the queue | none, logged | The worker reports and moves on rather than stopping |
| Handling an event fails | none, logged | The event is lost. EN-35 is what closes this |

## Running it

`npm run up` starts the four tiers, worker included. The published image carries the worker
too; it is started from the same image with a different command:

```bash
docker run --entrypoint node <image> apps/worker/dist/index.js
```

## Known limits

**The relay does not run on Vercel.** `api/index.ts` composes the application but never calls
`application.start()`, which is what schedules the relay — and a function that ends with its
response could not hold an interval anyway. On that deployment the outbox therefore fills and
nothing drains it: items are created, events are recorded, and no notification ever appears.

This is not something this issue can settle. `D-12`, the deployment target, is still open in
the backlog and no ADR covers it. The three options, for whoever picks it up:

- a scheduled call to a guarded relay endpoint, which needs a shared secret and therefore
  touches EN-30;
- moving the relay into the worker, so the long-lived process drains the outbox as well as the
  queue. The demonstration then shows the outbox growing rather than the broker queue;
- running the published image, where both processes are long-lived and nothing is missing.

Until then, the flow is complete when run from the image or locally, and incomplete on Vercel.
Saying so here is better than a reviewer finding it in production.
