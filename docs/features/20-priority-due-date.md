# Prioritize and schedule tasks

- **Issue**: #20
- **Epic**: Tasks
- **Delivered**: 2026-09-11
- **Decisions that apply**: ADR-0001, ADR-0006, ADR-0007

## What it does

A project member can give a task a low, normal or high priority and an optional due date when
creating or editing it. Normal is the default. A past date is accepted because it records the
task's actual situation rather than making the form unusable once work is late.

Tasks are ordered by priority from high to low, then by the nearest due date. Undated tasks
follow dated tasks at the same priority, and the identifier is the final key so equivalent
tasks keep the same order across loads and page boundaries.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `GET /projects/:projectId/items` | Returns tasks in stable planning order | session required |
| `POST /projects/:projectId/items` | Creates a task with optional planning values | session required |
| `PUT /projects/:projectId/items/:id` | Changes the name, priority or due date | session required |
| New item and edit forms | Collect priority and an optional calendar date | session required |

`CreateItemBody`, `UpdateItemBody`, `ItemDto` and `ItemPageDto` in `packages/contracts` govern
the request and response shapes. `priority` accepts `low`, `normal` or `high`; `dueDate`
accepts an ISO calendar date (`YYYY-MM-DD`) or `null`. Omitting priority on a write keeps the
database default for creation and the current value for an update. Omitting the due date does
the same; sending `null` clears it.

## Data

Migration `20260910221142_item_priority_due_date` adds `items.priority` as the PostgreSQL enum
`item_priority`, not null with `normal` as its default. Existing rows therefore remain valid
without a nullable branch. `items.due_date` uses PostgreSQL `date` and is nullable.

A due date is a calendar fact, so no time or offset is persisted and no UTC conversion can
shift it to the previous day. The API carries the canonical ISO date. The browser reconstructs
that calendar day in its own time zone and formats it with its locale.

Index `items_project_id_priority_due_date_id_idx` serves both project isolation and the public
order: project, descending priority, ascending due date with nulls last, then identifier. The
opaque cursor contains those three sort values. It is validated before any value reaches a
PostgREST filter.

The item and its `item.created.v1` event are still written through one database function and
one transaction. The event payload remains limited to item and owner identifiers: priority,
due date and task name do not enter the broker.

## Errors

| Situation | Response | Note |
|---|---|---|
| Unknown priority | `400 validation_error` | Rejected before the use case |
| Malformed or impossible calendar date | `400 validation_error` | Past valid dates are accepted |
| Invalid pagination cursor | `400 invalid_item_cursor` | No filter fragment is evaluated |
| Non-member or absent project | `404 project_not_found` | Same response prevents project discovery |
| Non-member or absent task on update | `404 item_not_found` | Same response prevents task discovery |
| Storage failure | `500 internal_error` | The response contains no submitted values |

## Accessibility

- Priority is a labelled native select and due date is a labelled native date input. The due
  date help text is connected with `aria-describedby` and states that the field is optional.
- The task card spells out the priority. A late task includes the visible word `Overdue`, so
  neither meaning depends on colour.
- The due date is rendered in a `time` element whose `dateTime` keeps the canonical ISO value.
- Creation and editing remain fully keyboard operable. Saving returns focus to the task's Edit
  button, and the shared polite live region announces the result.
- `axe-core` covers the initial board and the expanded edit form. The shared palette tests
  continue to enforce text, control and focus contrast.

## Personal data

Priority and due date describe user-created work. They are stored only on `public.items`, are
included in the account export and follow the item's existing erasure rules. They are sent to
Supabase for persistence and pass through Vercel with the item API request. Neither value is
written to logs, analytics, browser persistence or an event payload.

## How to verify

Run the automated checks on a fresh checkout:

```bash
npm run db:start
npm run db:reset
npm run typecheck
npm test
npm run test:integration
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
npm run build
```

For a manual pass, create one task for each priority, give two high-priority tasks the same
date, leave another task undated and use a past date once. Reload the page and load the next
page. Check that the order remains high, normal, low; dates remain nearest first; equivalent
tasks do not swap; and the late task says `Overdue`. Edit a task with only the keyboard, clear
its date and confirm that focus returns to its Edit button.

## Known limits

Priority has three fixed values. Custom scales, reminders and time-of-day deadlines are not
part of this issue.
