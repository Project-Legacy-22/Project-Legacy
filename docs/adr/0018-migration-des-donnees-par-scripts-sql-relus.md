# ADR-0018 — Data migration in both directions through generated and reviewed SQL scripts

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: team, after the intermediate defense
- **Related issue**: #275 (import), #282 (exit), extends ADR-0017

## Context

The intermediate defense asks for two things about the data. First, a clear, reproducible and as
transparent as possible procedure to take in the data of the original project, which stored it in
a MySQL or a SQLite depending on the deployment, into our PostgreSQL. Second, the ability to leave
Supabase without abandoning the users' data.

ADR-0017 sets the requirement: the dependency on Supabase is owned because it is reversible, and
both paths must be tested before they are needed. It does not say how; this document decides it.

The two directions are not symmetric. The legacy has a three-column table (`todo_items`); our
schema has ten for the tasks, plus the accounts, the projects, the memberships and the
notifications. Importing means enriching while deciding what is missing; exiting means translating
without losing anything.

## Options considered

### Option A — a transfer tool connected to both databases (pgloader or equivalent)
- Pros: an established tool, direct transfer from MySQL or SQLite to PostgreSQL.
- Cons: a single direction; it writes into the target database without leaving a script to
  review; it needs network access and credentials to both databases at the same time; the import
  rules (owner, project, status) become configuration specific to the tool.

### Option B — the native exports of the engines, and nothing else
- Pros: no code to write (`mysqldump`, `sqlite3 .dump`, `supabase db dump`).
- Cons: a MySQL export does not load into our schema, and a PostgreSQL export loads neither into
  MySQL nor into SQLite. The translation remains to be done, by hand, on the day it is needed.

### Option C — a package that reads an export and writes SQL scripts, reviewed then applied
- Pros: both directions with the same tool; the script is a text reviewed before being applied,
  within a transaction; no connection opened by the tool; replayable and verifiable in continuous
  integration.
- Cons: code of our own, to maintain when the schema changes; reading two export dialects
  correctly.

## Decision

We choose **option C**: `packages/data-migration`, which reads a text export and writes SQL
scripts.

Because:

- **Applying a data migration is a human decision.** The tool writes; a person reviews the script
  then applies it with `psql --set ON_ERROR_STOP=1`. The script is wrapped in a transaction and
  refuses the whole import if the recipient account does not exist, rather than creating a project
  nobody owns.
- **An exit tool does not depend on what it leaves.** The package declares no dependency and opens
  no connection. It works on the day Supabase can no longer be reached.
- **The proof is replayable.** `npm run test:migration` starts PostgreSQL 17, MySQL 8.4 and
  SQLite, brings a `mysqldump` export into our schema, takes our data out to the three targets and
  compares the values end to end. The integration pipeline runs the same command.

The rules of each direction are part of the decision:

- **Import**: the source engine is a parameter and not a detection (`mysqldump` and `sqlite3` do
  not escape the apostrophe the same way). Nothing is altered to make a row fit: an invalid row is
  refused and named in the report. The project identifier is provided by the person, which makes
  the import replayable without creating a duplicate.
- **Exit**: the schema is translated from ours for each target, never brought back to the legacy
  table, which would lose the project, the owner, the priority, the due date and the
  notifications. A timestamp outside UTC is refused rather than shifted by guesswork.
- **Schema model**: `packages/data-migration/src/schema.ts` describes our tables for the
  translation. An integration test (`schema-model.integration.test.ts`) fails as soon as this model
  diverges from the real database: columns, order, default values and foreign keys.

## Consequences

**Positive**
- Both paths exist, are documented and are run on every change.
- Nothing leaves or enters a database without a person having read what is about to be written.
- The import script, which contains the address of the recipient, is written outside the
  repository (`data-out/`, ignored by Git).

**Negative / accepted debt**
- Every schema migration must update the model; the integration test is the reminder. The model
  also follows the limits of the poorest target: MySQL, for example, refuses a default value on a
  `text` column.
- What does not cross: the accounts and the passwords (Supabase Auth), the row-level security
  policies, the triggers and the value checks. They are named in `docs/data-migration.md` as the
  real cost of a departure.
- The import has only been run on test exports, not on a production legacy database.

**What it imposes on the rest of the project**
- A migration that adds a table or a column updates `schema.ts` in the same pull request.
- A new column type must have a translation for MySQL and SQLite, or be refused explicitly by the
  tool.

## How we will know we were wrong

A real import fails on an export form that `test:migration` does not cover; or maintaining
`schema.ts` costs more time than the migrations themselves; or an exit to another provider
requires a direct connection that the "no connection" principle forbids.

## Amendment of 2026-09-24 — the accounts cross (#426)

The second intermediate defense asked for the exit to take authentication along as well. The
decision does not change its form: the tool still reads a text dump, `-s public,auth` instead of
`-s public`, and writes one more reviewed script per target, `<target>-accounts.sql`. It still
opens no connection, which ruled out the GoTrue administration API.

The debt "what does not cross: the accounts and the passwords" is lifted for the accounts:
identifier, address, bcrypt hash and address confirmation go out, in a separate file because it
carries the hashes. GoTrue itself, its sessions and its tokens remain the exit cost.

## References

- `docs/data-migration.md`: the commands of both directions and what each one decides
- ADR-0005 (schema as versioned migrations), ADR-0017 (hosting and reversibility)
