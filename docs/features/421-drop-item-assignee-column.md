# Drop the single assignee column

- **Issue**: #421
- **Epic**: Tasks
- **Delivered**: 2026-09-28
- **Decisions that apply**: ADR-0019

## What it does

Nothing changes for the people using the application. `items.assignee_id`, the single
assignee of #348, is removed: assignments live in `item_assignees` only since #419, and the
column had been kept, unread, until the code that stops reading it was released.

## Data

Migration `20260928100000_drop_item_assignee_column`:

1. copies into `item_assignees` any value of the column that is not there yet. The copy made
   by #419 should already hold them all; this one makes sure none is lost with the column;
2. drops the index `items_project_assignee_idx`, the key `items_assignee_membership_fkey`,
   then the column.

It is the second step ADR-0019 requires for a removal. It reaches the hosted database, shared
by production and previews, as soon as `ci` passes on `dev`. That is safe because #422, the
code that stops reading the column, is in `main` since release #424.

The data migration model (`packages/data-migration/src/schema.ts`) and the generated types
(`packages/infra/src/database.types.ts`) no longer carry the column.

## How to verify

```sh
npm run db:reset
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
npx vitest run packages/data-migration/src/render-schema.test.ts
```

`check-schema.sql` fails if `items.assignee_id` exists. The check of the column's own
behaviour, `check-item-assignee.sql`, is removed with it; `check-item-assignees.sql` covers
the table that replaced it.

## Known limits

The migration can be reversed only partly: a task assigned to several members cannot be put
back into one column without choosing one of them. Take a backup before it reaches the hosted
database (`npm run backup`, `docs/backup-and-exit.md`).
