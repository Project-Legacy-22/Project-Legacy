# Backup, restore, exit

Four questions this repository did not answer: what retention period is guaranteed, what happens if
the project is paused, how we back up, how we recover. They came from the intermediate defense,
with a sentence that settles it: abandoning the users' data is not acceptable.

## 1. What the free plan guarantees

Nothing, and the provider writes it in black and white.

| Fact | Source |
|---|---|
| "We may pause applications on the Free Plan that exhibit low activity in a 7-day period to save on server resources." | [Going into prod](https://supabase.com/docs/guides/platform/going-into-prod) |
| "You can restore paused projects from the Supabase dashboard." | same |
| "Database backups are not available for download for Free Plan projects." | same |
| "We recommend that free tier plan projects regularly export their data using the Supabase CLI `db dump` command and maintain off-site backups." | [Backups](https://supabase.com/docs/guides/platform/backups) |
| The Pro plan gives access to the last seven days of daily backups. | same |

Three consequences, better stated than discovered:

- **seven days without activity are enough** for the project to be paused. A holiday period, a
  sprint on something else, and the application no longer responds;
- a pause can be undone from the dashboard, so it is not a loss. But **recovery depends on the
  provider**: it holds the only copy;
- on this plan, **the backup we take is the only one that exists**. Supabase does not hide it, it
  explicitly recommends doing it yourself.

This is the reason for everything that follows, and for ADR-0017.

## 2. Backing up

```bash
npm run backup              # the linked project, the one `supabase link` recorded
npm run backup -- --local   # the local stack
```

Without `--local`, the CLI asks for the database password, or reads `SUPABASE_DB_PASSWORD`.

The command writes four files into `backups/<timestamp>/`:

| File | What it carries |
|---|---|
| `roles.sql` | the roles of the cluster and their settings |
| `schema.sql` | the tables, the types, the functions, the row-level security policies |
| `data.sql` | the data, **`auth` schema included** |
| `MANIFEST.txt` | the date, the target, the CLI version, and the size and SHA-256 hash of each file |

The order of the table is the restore order: data before the schema has nowhere to go.

**`data.sql` carries the accounts and their password hashes**, because the data dump includes the
`auth` schema. This folder is therefore personal data within the meaning of the regulation:
`.gitignore` excludes it from the repository, and a backup that really matters must leave the
machine.

The manifest exists so that a folder of three `.sql` files found in six months says where it comes
from and whether something damaged it.

## 3. Restoring

The target is **a new Supabase project, on which our migrations have not run**. Both halves of this
sentence were measured, and each has a reason.

*A Supabase project*, because `schema.sql` creates its extensions in the `extensions` and `vault`
schemas, and `data.sql` inserts into `auth.users` — tables that GoTrue manages and that our dump
does not create. A bare PostgreSQL database therefore refuses this restore. To leave for any
PostgreSQL, or for MySQL or SQLite, `docs/data-migration.md` applies.

*On which our migrations have not run*, because the initial migration creates the system user.
Restoring on top of it fails on
`ERROR: duplicate key value violates unique constraint "users_pkey"` — measured on 12 September
2026, not assumed.

```bash
# 1. A new project, then its coordinates
supabase link --project-ref <new-ref>

# 2. The three files, in this order
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/<timestamp>/roles.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/<timestamp>/schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backups/<timestamp>/data.sql

# 3. Compare, table by table, with the counts of the source
```

### What was tested, and when

On 12 September 2026, on the local stack (PostgreSQL 17.6, Supabase CLI 2.116.0).

An account was created with a known password, and its sign-in checked. Backup taken. Both schemas
entirely emptied. `data.sql` applied. Then the two checks that matter:

| Table | Before | After |
|---|---|---|
| `auth.users` | 68 | 68 |
| `public.users` | 69 | 69 |
| `public.projects` | 79 | 79 |
| `public.project_memberships` | 79 | 79 |
| `public.items` | 36 | 36 |
| `public.outbox` | 38 | 38 |
| `public.notifications` | 30 | 30 |

And above all: **the account signed in again with its original password**. Rows that come back are
not the same thing as people who can come back; the second is what had to be demonstrated.

### What was not tested, and why

`schema.sql` was not applied to a truly new project: that would require a second one, and the only
hosted project is the one in use. What the restore above exercised is `data.sql` on a schema the
migrations had built — and `schema.sql` is a dump of that same schema, and the integration pipeline
rebuilds that schema from the migrations on every run. The remaining risk is therefore narrow, but
it is not zero, and it is written here rather than passed over in silence.

## 4. Leaving

Leaving Supabase breaks down into three parts, only one of which is free.

**The schema is secured.** Versioned migrations rebuild a blank PostgreSQL, and
`packages/data-migration` also translates it for MySQL and SQLite. This is tested on three real
engines by `npm run test:migration`.

**The data is secured.** In both directions, and tested the same way. The detail is in
`docs/data-migration.md`.

**What remains to be rewritten** — named now, so as not to discover it on the day of departure:

| What we lose | What is needed instead |
|---|---|
| GoTrue: registration, sign-in, tokens, reset, emails | an authentication service, or a library in the application |
| the row-level security policies | application-level authorization, to write and test |
| PostgREST | the routes missing from the API, if some still go through it |

Two clarifications on this list. The accounts are not lost: `npm run data:export` writes them for
each target engine, bcrypt hashes included (#426), and the replacement of GoTrue only needs a
bcrypt library to read them back — `docs/data-migration.md`, "The accounts". And the row policies
are the most expensive part: today the database itself refuses what an account is not allowed to
read, and without them it is up to the application never to make a mistake.

ADR-0017 carries the decision and its cost. This document carries the commands.

## 5. What a reader would lose today

If the hosted project disappeared now, without a backup taken: **everything**, except the schema,
which the repository rebuilds. Accounts, projects, tasks, notifications.

With a backup taken: nothing of what it contains, and therefore everything written since. This is
the only real question of frequency, and it has no good automatic answer on the free plan: the
command is manual, so the possible loss is the interval between two runs.
