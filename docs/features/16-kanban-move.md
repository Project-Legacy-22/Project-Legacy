# Move tasks across the Kanban board

- **Issue**: #220, sub-issue of #16
- **Epic**: Tasks
- **Delivered**: 2026-09-10
- **Decisions that apply**: ADR-0001, ADR-0006, ADR-0007, ADR-0011

## What it does

The selected project displays its tasks in the three fixed columns `Todo`, `In progress` and
`Done`. Columns cannot be added, removed or renamed. Each task can be dragged to another
column, or moved through a native button, labelled select, confirmation and cancellation
controls.

The button path is the complete alternative to dragging. It works without a pointer, keeps
focus on the moved task and announces the resulting column. Empty columns remain visible so
the board and its available destinations do not disappear with their last task.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `GET /projects/:projectId/items` | Loads one page of project tasks and their current versions | session required |
| `PUT /projects/:projectId/items/:id` | Renames a task without changing its Kanban status | session required |
| `PATCH /projects/:projectId/items/:id/status` | Moves a task with optimistic concurrency | session required |
| Kanban board | Displays and moves tasks across three fixed columns | session required |

The move body is `{ status, version }`. `status` accepts only `todo`, `doing` or `done`, and
`version` is the positive version last read by the browser. A successful response carries the
new status and incremented version. The inherited `completed` boolean is no longer part of the
browser contract.

## Failure and concurrency behaviour

The browser moves a task immediately while the request is pending and disables its actions. If
the server refuses the request, the previous task is restored and the error explains how to
retry from its Move button.

A `409 item_status_conflict` means another request moved the same task from the version shown
on screen. The browser reloads the first task page before enabling the board again. It displays
the authoritative column and asks the person to choose a destination again; it never silently
overwrites the other change.

Session expiry remains handled by the shared API guard. A terminal `401` returns to the sign-in
screen instead of being presented as a recoverable Kanban failure.

## Accessibility

- The board uses a section and heading for each column, with a visible task count and empty
  state.
- Every pointer drag has a native-button alternative. Its select has a persistent label and its
  confirmation and cancellation controls follow it in document order.
- Opening the move controls focuses the destination. Cancelling or completing the request
  returns focus to the same task's Move button, even when the task changes columns.
- Successes use the shared polite, atomic live region. Failures use an alert and keep a visible
  retry path.
- Focus indicators meet the shared contrast rule. The responsive layout becomes one column
  before horizontal scrolling is needed.
- Kanban transitions are covered by the global `prefers-reduced-motion: reduce` override.
- `axe-core` checks the board, rename form and move form against the supported WCAG A and AA
  rules. Palette tests separately enforce text, interface and focus contrast.

## Personal data

Task names are rendered only in the selected project and sent only to the project API when a
task is created or renamed. Moving a task sends its identifier, status and version; it does not
copy the name into browser persistence, a third-party service, a log or an event.

## How to verify

Run the automated checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

For a manual keyboard pass, start the application, sign in and select a project containing at
least one task. Tab to that task's Move button, activate it, choose each destination with the
arrow keys, cancel once, then confirm. Check that focus returns to the moved task and that a
screen reader announces the new column.

For a pointer pass, drag tasks across all three columns, including into an empty column. In the
browser network tools, reject one move and return one `409`: the first restores the previous
column and permits a retry; the second reloads the server state before the board is enabled.
