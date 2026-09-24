# Assign a task to a member of its project

- **Issue**: #348 (US-58)
- **Epic**: Tasks
- **Delivered**: 2026-09-24
- **Decisions that apply**: ADR-0001, ADR-0003, ADR-0005, ADR-0019

## What it does

A member of a shared project assigns a task to another member, or to nobody, from the
task's edit form. The card then says who it is assigned to. The creator of the task does
not change: assigning is a second, optional fact.

The choice is offered only in a project with more than one member. Removing a member, or
erasing their account, leaves their tasks in the project, unassigned.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `PUT /projects/:projectId/items/:id` | `assigneeId` in the body: a member's identifier, `null` for nobody, absent to leave it unchanged | session required, project member |
| `GET /projects/:projectId/items` and the other task responses | every task carries `assigneeId` | session required |
| Task edit form | "Assigned to" select: Nobody, then each member by address | signed in |
| Task card | "Assigned to <address>" when assigned | signed in |

Shapes are governed by `UpdateItemBody` and `ItemDto` in `packages/contracts/src/items.ts`.
The interface names members from `GET /projects/:projectId/members`, which it reads for
the selected project.

## Data

Migration `20260924120000_item_assignee` adds `items.assignee_id` and a foreign key from
`(project_id, assignee_id)` to `project_memberships (project_id, user_id)` with
`on delete set null (assignee_id)`:

- the database refuses an assignee who is not a member of the task's project;
- deleting the membership (removal, account erasure, project deletion) clears the
  assignee in the same statement and keeps the task. `remove_project_member` needs no
  change, which its note for #348 anticipated;
- an assignment racing a removal waits for the key lock and is refused if the membership
  is gone. The adapter maps that refusal to the same 404 as the use case.

An index on `(project_id, assignee_id)` keeps removals from scanning the project's tasks.
The data migration tool exports the column; on MySQL and SQLite the key points at the
account with `on delete set null`, since the "member of the project" rule does not cross,
like the other checks listed in `docs/data-migration.md`.

## Errors

| Situation | Response | Note |
|---|---|---|
| Assignee not a member of the project, or unknown | `404 assignee_not_found` | does not reveal whether the account exists |
| Assignee not a UUID | `400 validation_error` | |
| Task missing or caller outside the project | `404 item_not_found` | unchanged |

## Accessibility

The field is a native `select` with its label, reached with Tab in the edit form. Once
saved, the row announces the change in a polite live region ("<task> is now assigned to
<address>" or "<task> is no longer assigned to anyone"), in addition to the saved message.
The edit form has no axe violation with the field shown.

## Personal data

The assignee is an account identifier stored on the task; the interface shows their
address, which members of the project already see in the member list. It is never logged
nor placed in an event. See `T-03` in `docs/gdpr/registre.md`.

## How to verify

```sh
npm run test:unit -- packages/core/items
npm run test:http -- item-planning.test.ts
npm run test:dom -- app-assignment.test.tsx
npm run test:integration -- item-assignee.integration.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
```

`check-item-assignee.sql` checks, in a rolled-back transaction, that an outsider is
refused by the key, that removing the member unassigns the task and keeps it, and that
deleting the project deletes its assigned tasks.

## Known limits

- The personal data export lists the tasks a person created, with their assignee; it does
  not list the tasks other members assigned to them.
- The assignee is not notified, and tasks cannot be filtered by assignee.
- The member list of the edit form is read when a project is selected, and again after a
  member is removed from the members panel; a member who joins meanwhile appears on the
  next selection.
