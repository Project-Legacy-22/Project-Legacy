# Edit, complete and delete an item

- **Issue**: #32
- **Epic**: Tasks
- **Delivered**: 2026-09-09
- **Decisions that apply**: ADR-0001, ADR-0006, ADR-0007, ADR-0008

## What it does

A project member can rename an item and delete it from the project Kanban board. The controls
are always visible and work with a keyboard. A deletion asks for confirmation that names the
item, then removes it permanently. Status changes now use the dedicated Kanban interaction
documented in `docs/features/16-kanban-move.md`.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `PUT /projects/:projectId/items/:id` | Renames an item without changing its status | session required |
| `PATCH /projects/:projectId/items/:id/status` | Moves an item between Kanban states | session required |
| `DELETE /projects/:projectId/items/:id` | Permanently removes an item | session required |
| Item row actions | Move, rename or remove an item | session required |

`ProjectItemIdParams` validates both identifiers. `UpdateItemBody` requires a non-empty item
name of at most 255 characters. A rename preserves the current Kanban status and increments
the version. A successful update returns `ItemDto`; a successful deletion returns `204` with
no response document.

## Data

Every read before a mutation is scoped by item id, project id and the caller's project
membership. The API uses the service role, so the repository performs this check explicitly.
The item RLS policies repeat the same membership rule for direct authenticated database
access. A caller outside the project cannot read, update or delete its items.

Migration `20260909123004_remove_item_soft_deletion` removes `items.deleted_at` and replaces
the partial pagination index with an index that has no deletion-state predicate. The delete
repository operation issues a physical `DELETE`; no hidden row or deletion-state filter
remains. Project deletion still removes its items through the existing foreign-key cascade.

Migration `20260910164929_item_kanban_status` replaces the boolean with the constrained
statuses `todo`, `doing` and `done`. Each row also carries a positive version. A status update
must send the version it read; the write increments it atomically and rejects a stale request.

## Events

Renaming, moving and deleting an item publish no event. Item creation remains the only mutation
in this scope that publishes `item.created.v1`.

## Errors

| Situation | Response | Note |
|---|---|---|
| Missing or invalid session | `401 session_required` | Applied before every item route |
| Invalid identifier, empty name or name over 255 characters | `400 validation_error` | Rejected at the HTTP boundary |
| Invalid name reaching the domain | `400 invalid_item_name` | The domain enforces the same invariant |
| Item absent, outside the project or caller not a member | `404 item_not_found` | The response does not disclose whether the item exists |
| Status move based on a stale version | `409 item_status_conflict` | The latest stored state is preserved |
| Storage failure | `500 internal_error` | No database detail or submitted value is returned |

The not-found check runs before either write. An inaccessible item and an unknown item produce
the same status and problem type, and neither path changes stored data.

## Accessibility

- Move, edit and remove are native buttons that remain visible without hover.
- Starting an edit moves focus to a labelled input. Help and validation errors are connected
  with `aria-describedby`, invalid input uses `aria-invalid`, and the error is an alert.
- Saving or cancelling returns focus to the edit button. After deletion, focus moves to an
  adjacent item action or to the item creation field when the list is empty.
- The deletion confirmation names the item. Mutation success and failure are announced in the
  existing live feedback region.
- Automated `axe-core` checks cover the Kanban board and its inline edit and move states.

## Personal data

An item name is personal data. It is stored only in `items.name` while the item exists and is
physically removed on deletion. It is never written to logs, events, browser persistence or a
third-party service. Error responses describe the violated rule without echoing the submitted
name.

## How to verify

Apply every migration to a fresh local database, lint the schema and run its structural and
RLS assertions:

```bash
npm run db:reset
npm run db:lint
docker exec -i supabase_db_legacy-todo psql -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -f - < scripts/check-schema.sql
```

Run the unit, route, browser and real-database mutation tests:

```bash
npm test -- packages/core/items/src/application/change-item.test.ts \
  packages/core/items/src/application/remove-item.test.ts \
  apps/api/src/http/routes/items.test.ts \
  apps/web/src/item-mutations-workflow.test.tsx \
  apps/web/src/todo-page.test.tsx
npm run test:integration -- apps/api/test/integration/items.integration.test.ts
```

For a manual check, start the application, sign in, select a project and create an item. Move it
to `In progress`, rename it and verify that it stays in that column, then remove it. Exercise
the same sequence with Tab, Enter and Space, and confirm that the removal prompt includes the
item name.
