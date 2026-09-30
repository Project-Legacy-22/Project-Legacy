# Data migration

How to bring in data coming from another engine, and how to take ours out. ADR-0017 says why these
two paths exist: the dependency on Supabase is owned because it is reversible, and a reversibility
that has never been run is an intention, not a property.

The tools are in `packages/data-migration`. This package **declares no dependency**, neither
external nor internal, and it opens **no connection**: it reads text and writes text. Both choices
are intentional. The first because an exit tool that depends on what it leaves is not an exit
tool. The second because a script reviewed before being applied is the only form that leaves a
chance to refuse an import that went wrong — and applying a migration is a decision that belongs to
a person, not to a program.

To back up and restore without changing engine — and for what a departure from Supabase would
cost — see `docs/backup-and-exit.md`.

## What never crosses

Before the procedures, what neither of them carries, because it is not SQL:

- **the authentication service**. The accounts cross since #426, hashes included (see "The
  accounts" below), but not GoTrue: registration, sign-in, tokens and emails have to be provided by
  the target, with a bcrypt library to read the hashes back. Sessions and refresh tokens do not
  cross: everybody signs in again once.
- **the row-level security policies**, which are PostgreSQL and have no equivalent in MySQL or in
  SQLite. On another engine, authorization becomes entirely application code again.

ADR-0017 names them as the exit cost. They are written here so that nobody discovers them on the
day of departure.

## Direction 1: from a MySQL or a SQLite to our PostgreSQL

This is the import path of the original project, which stored its tasks in one or the other
depending on the deployment: `src/persistence/mysql.js` and `src/persistence/sqlite.js` at commit
`42752ef`, both creating the same table
`todo_items (id varchar(36), name varchar(255), completed boolean)`.

### 1. Produce the export

From a MySQL:

```bash
mysqldump --no-tablespaces --skip-add-locks legacy todo_items > legacy.sql
```

From a SQLite:

```bash
sqlite3 legacy.db .dump > legacy.sql
```

Both forms are read. The engine is a parameter of the next command, never a detection: `mysqldump`
writes an apostrophe as `\'`, `sqlite3` writes `''` and leaves a backslash as is, and reading a
SQLite export with the rules of MySQL would merge two columns as soon as a task name ends with a
backslash.

### 2. Write the import script

The recipient account must exist: the import attaches tasks, it does not create an account. The
project identifier is provided rather than drawn at random, and it is what makes the import
replayable — reusing it identically does not create a second project.

```bash
uuidgen | tr 'A-Z' 'a-z'          # the project identifier, to keep
npm run data:import -- \
  --from legacy.sql \
  --engine mysql \
  --owner someone@example.com \
  --project-id <the-uuid-above> \
  --project "Legacy import" \
  --out data-out
```

The command writes two files into `data-out/`, which `.gitignore` covers: the script carries the
address of the recipient in clear text, because it is the key that resolves the account, and
personal data has nothing to do in the history of the repository.

### 3. Review the script, then apply it

```bash
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f data-out/import-<timestamp>.sql
```

The script is wrapped in a transaction. If no account carries the address, it raises and
everything is rolled back: better an import that refuses than a project nobody owns.

### What the import decides, and what it refuses

The legacy has three columns, `items` has ten.

| Field | What is written | Why |
|---|---|---|
| owner | the address of `--owner`, resolved in SQL | an unknown address cancels the import |
| project | created by the import | `items.project_id` is `not null` since US-16 |
| `status` | `completed` true to `done`, false to `todo` | the only field the legacy carries |
| `priority`, `due_date`, `version` | left to the schema | the legacy has none of them |
| dates | the date of the import, written in clear in the script | the source has none, and inventing one per row would be a lie |

A null `completed` is read as `todo`, and the report says so: it is a reading, not a fact.

Nothing is altered to make a row fit: a name is neither truncated nor even trimmed. A silently
modified task is worse than a missing task, because the missing one is in the report. Refused and
named, with their line in the export: a missing identifier, an identifier that is not a UUID, an
identifier that appears twice, a name that is null, empty, or longer than 255 characters.

## Direction 2: from our PostgreSQL to another engine

A distinction first, because it must be written rather than discovered:

- **to a PostgreSQL** rebuilt by the rendered schema, the export is faithful: nothing is lost;
- **to a MySQL or a SQLite**, it is faithful only if the target schema is **translated from ours**.
  Rewriting the data into the three-column `todo_items` table of the original project would lose
  the project, the owner, the priority, the due date and the notifications. The exit therefore
  translates the schema; it does not go back to the legacy.

### 1. Produce the export

```bash
mkdir -p data-out   # the CLI does not create the folder
npx supabase db dump --local --data-only -s public,auth -f data-out/dump.sql
```

On the hosted project, replace `--local` with `--linked`. The command writes `insert` statements,
unless asked for `--use-copy`: that is the form the tool reads.

With `auth`, the dump carries the password hashes, the sessions and the refresh tokens: it is a
secret. It is written into `data-out/`, which `.gitignore` excludes, and is deleted once the export
is done. Without `auth`, the export happens anyway, without any account.

The export must be produced **in UTC**. A timestamp carrying another offset is refused rather than
converted: neither `datetime(6)` nor the text of SQLite carries a time zone, and shifting every
date by guesswork is precisely the kind of silence these tools exist to avoid.

### 2. Write the schema and the data for the three targets

```bash
npm run data:export -- --from data-out/dump.sql --out data-out
```

Nine files in `data-out/`: `<target>-schema.sql`, `<target>-data.sql` and `<target>-accounts.sql`
for `postgres`, `mysql` and `sqlite`. The schema is applied first, then the data, then the
accounts.

### The accounts

`<target>-accounts.sql` creates an `accounts` table and writes each row of `auth.users` into it:

| Column | Comes from | Note |
|---|---|---|
| `id` | `auth.users.id` | equal to `users.id`, foreign key to it: the account finds its tasks again |
| `email` | `auth.users.email` | unique |
| `password_hash` | `auth.users.encrypted_password` | bcrypt (`$2a$`), as GoTrue wrote it; null if the account has no password |
| `email_confirmed_at` | same | null for an address never confirmed |
| `created_at` | same | |

The accounts are in a separate file because it carries the hashes: it is transmitted, kept and
deleted like a secret, and `<target>-data.sql` stays without any. A hash cannot be decrypted: a
bcrypt library, on any platform, compares an entered password with it. Each person therefore signs
in on the target with their original password; those who had none, counted by the command, go
through a reset.

All the rows go in a single statement, within a transaction: if the target already carries one of
the addresses, no account is written.

### What the schema translation carries, and what it leaves

| Ours | postgres | mysql | sqlite |
|---|---|---|---|
| `uuid` | `uuid` | `char(36)` | `text` |
| `timestamptz` | `timestamptz` | `datetime(6)`, without a time zone | `text`, UTC |
| `jsonb` | `jsonb` | `json` | `text` |
| enumeration | the type it already has | inline `enum(...)` | `text` + `check` |

Types, nullability, keys, foreign keys, uniqueness and default values cross. What does not cross:
value checks (`char_length` is not written the same way in SQLite), row-level security policies,
triggers, and the identifier generator — a function of ours, which a target does not need since it
receives the identifiers with the data.

## Replaying the proof

A procedure that cannot be replayed is not a proof. Everything is in the repository:

```bash
npm run test:migration
```

The command starts three containers — PostgreSQL 17, MySQL 8.4 and an Alpine that only carries
`sqlite3` — and replays both directions: a `mysqldump` export enters our schema, then our data goes
out to the three targets, and the values are compared end to end. The accounts go out too, and the
hash read back in each target must accept the original password (`accounts.migration.test.ts`).

No port is published and no client needs to be installed: everything goes through
`docker compose exec`. Docker is enough, and the integration pipeline runs exactly the same
command. The containers live under the `migration` profile, so `npm run up` does not start them.

```bash
docker compose ps                          # see them
docker compose --profile migration down    # stop them
```

In the integration pipeline, the `Migration de donnees` job only runs on the release path: the pull
request from `dev` to `main` and the push on `main`. On an ordinary pull request it is skipped —
three engines to start for code that rarely changes.

The guard that keeps the model from drifting is elsewhere, at the `integration` level:
`schema-model.integration.test.ts` compares `packages/data-migration/src/schema.ts` with the
`information_schema` of the real database. A column added by a migration and missing from the
model fails this test, instead of silently disappearing from the exports.

## Real runs

A procedure that has never been played is not a procedure.

| Date | Direction | What was done |
|---|---|---|
| 2026-09-12 | legacy to us | A MySQL 8.4 loaded with six `todo_items` rows, exported by `mysqldump`, imported by `npm run data:import`. Four rows imported, two refused and named. Script applied on PostgreSQL 17.6, then applied again: nothing duplicated. Unknown address: the transaction is rolled back. |
| 2026-09-12 | us to elsewhere | Export of the four tasks to the three targets. Schema and data applied on PostgreSQL 17.6, MySQL 8.4 and SQLite 3.41. Identical counts, and a task named with two backslashes and an apostrophe found character for character in all three. |
| 2026-09-24 | us to elsewhere, with the accounts | `-s public,auth` dump of the local stack (the two accounts of the demonstration dataset, created by GoTrue). Schema, data and accounts applied on the three engines of the containers. In each one, the hash that arrived accepts the original password and refuses another, checked with `crypt()` from pgcrypto. No hash in the data files. |

These two rows are the run that served to write the procedure. `npm run test:migration` replays
them, and that command is what counts as proof: it depends on no state left by the previous one,
since it rebuilds the three databases from nothing.

The test found two real defects, which is the reason it exists. The rendered schema did not carry
the default values, so a target refused the rows our own import script sent it
(`null value in column "version"`). And a backslash was halved on arriving in MySQL, where it is an
escape inside a literal.
