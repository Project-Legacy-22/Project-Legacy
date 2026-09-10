# Migrations

The schema is the sum of the files in this directory. Nothing creates tables at
application startup.

## Naming

`AAAAMMJJHHMMSS_courte_description.sql` — a 14-digit UTC timestamp, then a short
snake_case description. `supabase migration new <description>` generates the
prefix. The timestamp is the apply order (lexical), and two people adding a
migration the same day get distinct filenames with no shared counter, so
parallel work never collides.

This differs from the `20260901T1030_` form in `standards/04-git.md` §4: the
Supabase CLI parser requires a pure 14-digit prefix. The guarantee is identical.

## Header

Every file starts with a comment block:

```
-- Migration:  <filename without extension>
-- Purpose:    what this changes and why.
-- Reversible: yes
-- Rollback:
--   <the exact SQL that undoes this migration>
```

or, when the change cannot be undone:

```
-- IRREVERSIBLE: <reason a rollback is impossible or unsafe>
```

The Supabase CLI applies migrations up-only; it has no `down` command. The
`Rollback` block is the reversal of record. Locally, `supabase db reset` rebuilds
the database from an empty state by replaying every migration.

## Commands

- `npm run db:start` — start the local stack.
- `npm run db:reset` — drop and rebuild the local database from the migrations
  and `supabase/seed.sql`.
- `npm run db:types` — regenerate `packages/infra/src/database.types.ts`. Run it
  after every migration and commit the result.
- `npm run db:lint` — static checks on the schema.
