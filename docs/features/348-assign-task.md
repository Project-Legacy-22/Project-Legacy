# Assign a task to members of its project

- **Issue**: #348 (US-58), extended by #419 (several assignees, from creation)
- **Epic**: Tasks
- **Delivered**: 2026-09-24
- **Decisions that apply**: ADR-0001, ADR-0003, ADR-0005, ADR-0019

## What it does

A member of a shared project assigns a task to one or several other members, or to nobody,
when creating it or from its edit form. The card then says who it is assigned to. The
creator of the task does not change: assigning is a separate fact.

The choice is offered only in a project with more than one member. Removing a member, or
erasing their account, takes them off their tasks' assignees and leaves the tasks in the
project.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `POST /projects/:projectId/items` | `assigneeIds` in the body: members assigned from the start, optional | session required, project member |
| `PUT /projects/:projectId/items/:id` | `assigneeIds` replaces the list; `[]` for nobody; absent leaves it unchanged | session required, project member |
| Every task response | `assigneeIds`, sorted, each member once | session required |
| Task creation and edit forms | "Assigned to" group: one checkbox per member | signed in |
| Task card | "Assigned to <address>, <address>" when assigned | signed in |

Shapes are governed by `CreateItemBody`, `UpdateItemBody` and `ItemDto` in
`packages/contracts/src/items.ts`, with at most `MAX_ITEM_ASSIGNEES` (50) identifiers. The
interface names members from `GET /projects/:projectId/members`, read for the selected
project.

## Data

Migration `20260924140000_item_assignees` adds `public.item_assignees (item_id,
project_id, user_id)`, one row per assignee, with two keys:

- `(item_id, project_id)` to `items (id, project_id)`, on delete cascade: the assignment
  belongs to the task, in the task's project;
- `(project_id, user_id)` to `project_memberships`, on delete cascade: only a member can be
  assigned, and removing the membership (removal, account erasure, project deletion)
  removes the row, never the task. `remove_project_member` needs no change.

`create_item_with_event` writes the task, its assignees and its event in one transaction,
so an outsider in the list leaves neither task nor event. `set_item_assignees` replaces the
list in one transaction. Both are executable by `service_role` only. The use cases check
membership first for a clear 404; the keys check it again against a member removed in
between, and the adapter maps that refusal (`23503`) to the same 404. Reads embed the
assignees, including the row returned by a reorder.

Migration `20260924120000_item_assignee` (#348) had added a single `items.assignee_id`. Its
values were copied into the new table and the column is no longer read. It is dropped by a
later migration (#421), once the release that stops reading it is in production (ADR-0019).

The data migration tool exports `item_assignees`; on MySQL and SQLite the keys point at the
task, the project and the account, since the "member of the project" rule does not cross.

## Errors

| Situation | Response | Note |
|---|---|---|
| An assignee is not a member of the project, or unknown | `404 assignee_not_found` | does not reveal whether the account exists; nothing is written |
| An assignee is not a UUID, or more than 50 | `400 validation_error` | |
| Task missing or caller outside the project | `404 item_not_found` | unchanged |

## Accessibility

The assignees are native checkboxes in a `fieldset` whose `legend` is "Assigned to", each
labelled by the member's address, reached with Tab and toggled with Space. Once an edit is
saved, the row announces the change in a polite live region ("<task> is now assigned to
<addresses>" or "<task> is no longer assigned to anyone"), in addition to the saved message.
The edit form has no axe violation with the group shown.

## Personal data

Assignees are account identifiers stored with the task; the interface shows their
addresses, which members of the project already see in the member list. It is never logged
nor placed in an event. See `T-03` in `docs/gdpr/registre.md`.

## How to verify

```sh
npm run test:unit -- packages/core/items
npm run test:http -- item-planning.test.ts
npm run test:dom -- app-assignment.test.tsx
npm run test:integration -- item-assignees.integration.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
```

`check-item-assignees.sql` checks, in a rolled-back transaction, that creation stores each
assignee once, that an outsider cancels the whole creation, that the list is replaced, that
removing a member removes only their assignment, and that deleting a task deletes its
assignments.

## Known limits

- The personal data export lists the tasks a person created; it does not list the tasks
  other members assigned to them.
- The assignee is not notified, and tasks cannot be filtered by assignee.
- The member list of the edit form is read when a project is selected, and again after a
  member is removed from the members panel; a member who joins meanwhile appears on the
  next selection.
