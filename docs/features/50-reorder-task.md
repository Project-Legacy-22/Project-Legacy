# Reorder tasks within a column

- **Issue**: #50
- **Epic**: Tasks
- **Decisions that apply**: ADR-0001, ADR-0006

## What it does

A project member can move a task up or down within its Kanban column using buttons that work
with a keyboard. The three status columns do not change. Priority and due-date sorting stays
first; manual ordering applies only between tasks with the same priority and due date in the
same column. A disabled button shows when no adjacent task can be swapped in that group.

The new order is stored in the database and survives a reload. A completed move is announced
through the board's polite live region without moving keyboard focus. A rejected or conflicting
move refreshes the list and announces the failure.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `PATCH /projects/:projectId/items/:id/position` | Swap with an adjacent task | project member |
| `GET /projects/:projectId/items` | Return pages in priority, due-date and position order | project member |
| Kanban task card | Move up or down without dragging | signed-in project member |

The PATCH body is `{ "position": "<adjacent task position>", "version": 1 }`. The position
is an opaque UUID returned in `ItemDto`, not an array index. The response is the moved task
with its new position and version. A non-member receives the same `404 item_not_found` as a
missing task. Malformed input and non-adjacent or cross-group positions receive a typed 400.
A stale version receives a 409; the client then reloads the server order.

## Data

Migration `20260923120000_item_position` adds the mandatory, unique `items.position` UUID.
Existing rows receive their own IDs as positions, preserving the previous order. New tasks
start with their IDs as positions. A database function swaps two adjacent positions and
increments both row versions in one transaction. It locks the project and checks the source
version so two moves of the same task cannot silently overwrite each other.

The list index and opaque pagination cursor include the position after priority and due date.
The cursor continues to bind to search and filter criteria. A task's status remains unchanged
by a reorder, and the existing cross-column move remains a separate operation.

## Accessibility and privacy

The controls are native buttons with task-specific labels. Their order and disabled state are
available to assistive technology, and the existing live region announces success or failure.
No animation is added, so reduced-motion preferences require no special branch. The reorder
request sends positions and a version, not the task name; the name appears only in the local
announcement and is not written to a persistent log by this action.

## How to verify

Run type checking, tests, the real-database integration suite, schema assertions and build
against a fresh local Supabase stack. Manually create two tasks with matching priority and due
date in one column. Move the second one up with only the keyboard, reload, and verify its order
persists while focus stays on the control. Try tasks with different planning values: their
relative priority and due-date order must not change. Move a task to another column and check
that it still appears there. Repeat with the browser's reduced-motion preference enabled.
