# Notifications

- **Issue**: #19
- **Epic**: Notifications
- **Delivered**: 2026-09-10
- **Decisions that apply**: ADR-0007

## What it does

A signed-in visitor can see the notifications the event flow produced for them: a badge next
to the session banner shows how many are unread, and a panel behind it lists every one, most
recent first, distinguishing read from unread and letting a visitor mark one as read.

Out of scope: e-mail delivery (ADR-0010 covers a different channel, password recovery, and
US-28 would need to extend it here); any notification kind besides an item being created,
since that is the only event the catalogue describes today.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `GET /notifications` | The caller's own notifications, paginated | session required |
| `GET /notifications/unread-count` | The caller's own unread count | session required |
| `PATCH /notifications/:id/read` | Mark one notification as read | session required |
| Signed-in view → notification badge | Toggles the panel below | requires a session to be visible |

Request and response shapes: `packages/contracts/src/notifications.ts`. The list is paginated
the same way `GET /items` is: an opaque cursor, a bounded page size, `nextCursor: null` once
the last page has been served.

## Data

Reads and updates `public.notifications` (added by `20260904110000_outbox_and_notifications`).
This issue's own migration, `20260910100000_notification_policies_and_pagination`, adds:

- `notifications_user_id_created_at_all_idx`, the index the list's keyset pagination walks
  (the existing partial index only covered the unread count's query);
- `notifications_select_own` and `notifications_update_own`, the row-level security policies
  the outbox migration deferred to US-11 and that only ever ended up covering items;
- `mark_notification_read`, a `SECURITY DEFINER` function that claims the idempotence in one
  round trip instead of a read followed by a conditional write.

A row is owned by the account it was created for (`user_id`), enforced by the application (a
notification is always read through `accountOf(res).id`) and, as a second line of defense, by
the two policies above reached directly through PostgREST.

## Events

None published. Consumes `item.created.v1` (unchanged, see `docs/events/catalog.md`); that
consumer and its idempotence were delivered by US-10b and are untouched here. This issue is the
first thing besides that consumer to read or write the table it produces.

## Errors

| Situation | Response | Note |
|---|---|---|
| A cursor not issued by this API | `400 invalid_notification_cursor` | Same posture as items' own cursor |
| A notification that does not exist, or belongs to someone else | `404 notification_not_found` | Identical either way: a `403` would confirm the id designates something real |
| Marking an already-read notification as read again | `204`, identical to the first call | The criterion the endpoint is built around, not an incidental choice |

## Accessibility

The unread count is a labeled sentence ("3 unread notifications"), not only a colored badge,
inside a `role="status"` region: a screen reader hears it change on its own, the way the effect
itself arrives, without anything moving focus. The panel's toggle button carries
`aria-expanded` and `aria-controls`; each notification's own "Mark as read" button disappears
once read rather than becoming a disabled no-op, and loading more of the list announces how
many arrived through the same polite live region `ItemsPagination` uses.

## Personal data

None. A notification carries only identifiers and dates (`id`, `itemId`, `readAt`,
`createdAt`); the wording shown ("A new item was created") lives in the interface, never in a
stored row, log line or event payload (the event catalogue's own rule, unaffected by this
issue).

## How to verify

```
npm run up                 # docker broker + supabase start + dev api and web
```
1. Sign in, add an item. Within a couple of seconds the badge in the session banner reads
   "1 unread notification" (the worker consumed `item.created.v1` in the background).
2. Activate the badge's neighbouring button: the panel opens and lists the notification,
   unread.
3. Activate "Mark as read" on it: the button disappears, the row now reads "Read".
4. Collapse and reopen the panel: the list reloads, still shows the notification, now read.
5. Add several items to build more than one page, open the panel, and use "Load more
   notifications" to confirm the second page has no overlap with the first.

Tests: `packages/core/notifications/src/**/*.test.ts` (domain and use cases),
`apps/api/src/http/routes/notifications.test.ts` (HTTP contract against a fake),
`apps/api/test/integration/notifications.integration.test.ts` and
`row-level-security.integration.test.ts` (the real stack and its policies),
`apps/web/src/api/notifications-api.test.ts`,
`apps/web/src/app-notifications-panel.test.tsx` (including the automated accessibility scan).

## Known limits

- No local Docker in this environment to drive the panel through an actual browser end to end;
  the DOM-level test suite and the CI integration job are what stand in for that (same
  limitation already noted on #146 and #48).
- The list is fetched once when the panel opens, not kept live while it stays open: a
  notification that arrives while the panel is already open only appears once it is
  closed and reopened, or the badge's own poll updates the count in the meantime.
