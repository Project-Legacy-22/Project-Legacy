# Edit, complete and delete an item

- **Issue**: #32
- **Epic**: Tasks
- **Delivered**: 2026-09-09
- **Decisions that apply**: ADR-0001, ADR-0006, ADR-0007, ADR-0008

## What it does

A project member can rename an item, mark it complete or open again, and delete it from the
project item list. The controls are always visible and work with a keyboard. A deletion asks
for confirmation that names the item, then removes it permanently.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `PUT /projects/:projectId/items/:id` | Replaces the editable item state | session required |
| `DELETE /projects/:projectId/items/:id` | Permanently removes an item | session required |
| Item row actions | Rename, complete, reopen or remove an item | session required |

`ProjectItemIdParams` validates both identifiers. `UpdateItemBody` requires a non-empty item
name of at most 255 characters and a boolean `completed` value. A successful update returns
`ItemDto`; a successful deletion returns `204` with no response document.

## Data

Every read before a mutation is scoped by item id, project id and the caller's project
membership. The API uses the service role, so the repository performs this check explicitly.
The item RLS policies repeat the same membership rule for direct authenticated database
access. A caller outside the project cannot read, update or delete its items.

Migration `20260909123004_remove_item_soft_deletion` removes `items.deleted_at` and replaces
the partial pagination index with an index that has no deletion-state predicate. The delete
repository operation issues a physical `DELETE`; no hidden row or deletion-state filter
remains. Project deletion still removes its items through the existing foreign-key cascade.

## Events

Renaming, completing, reopening and deleting an item publish no event. Repeating a completion
or reopening request therefore cannot create an additional event. Item creation remains the
only mutation in this scope that publishes `item.created.v1`.

## Errors

| Situation | Response | Note |
|---|---|---|
| Missing or invalid session | `401 session_required` | Applied before every item route |
| Invalid identifier, empty name or name over 255 characters | `400 validation_error` | Rejected at the HTTP boundary |
| Invalid name reaching the domain | `400 invalid_item_name` | The domain enforces the same invariant |
| Item absent, outside the project or caller not a member | `404 item_not_found` | The response does not disclose whether the item exists |
| Storage failure | `500 internal_error` | No database detail or submitted value is returned |

The not-found check runs before either write. An inaccessible item and an unknown item produce
the same status and problem type, and neither path changes stored data.

## Accessibility

- Complete, reopen, edit and remove are native buttons that remain visible without hover.
- Starting an edit moves focus to a labelled input. Help and validation errors are connected
  with `aria-describedby`, invalid input uses `aria-invalid`, and the error is an alert.
- Saving or cancelling returns focus to the edit button. After deletion, focus moves to an
  adjacent item action or to the item creation field when the list is empty.
- The deletion confirmation names the item. Mutation success and failure are announced in the
  existing live feedback region.
- Automated `axe-core` checks cover both the item list and its inline edit state.

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

For a manual check, start the application, sign in, select a project and create an item. Rename
it, complete it, reopen it, then remove it. Exercise the same sequence with Tab, Enter and
Space, and confirm that the removal prompt includes the item name.

## Known limits

Items still have the inherited open/completed boolean state. Moving them between Kanban
columns belongs to US-15 and is not part of this feature.
