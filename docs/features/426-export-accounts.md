# Take the accounts along when leaving Supabase

- **Issue**: #426
- **Epic**: GDPR
- **Delivered**: 2026-09-24
- **Decisions that apply**: ADR-0017, ADR-0018 (amended on 2026-09-24)

## What it does

`npm run data:export` used to write our schema and data for PostgreSQL, MySQL and SQLite, and
leave every account behind in GoTrue: leaving Supabase meant every person signing up again. It
now also writes the accounts, with their bcrypt password hashes, so each person signs in on the
target with their original password.

Out of scope: an authentication service to replace GoTrue, and GoTrue's sessions, refresh tokens
and audit log. Moving from one Supabase project to another is already covered by
`npm run backup`, which carries the `auth` schema (`docs/backup-and-exit.md`).

## Surface

| Command or file | Purpose |
|---|---|
| `npx supabase db dump --local --data-only -s public,auth -f data-out/dump.sql` | The dump, now with the `auth` schema. Use `--linked` for the hosted project. Create `data-out/` first: the CLI does not |
| `npm run data:export -- --from data-out/dump.sql --out data-out` | Writes `<target>-accounts.sql` next to the schema and data files, and says how many accounts have no password |
| `data-out/<target>-accounts.sql` | Creates `accounts` if missing, then inserts every account in one statement, in a transaction. Applied after `<target>-data.sql` |

A dump taken without `auth` still exports, with no accounts file and a message saying so.

## Data

`accounts`, one row per row of `auth.users`, defined in `packages/data-migration/src/accounts.ts`:

| Column | From | Note |
|---|---|---|
| `id` | `auth.users.id` | primary key, foreign key to `users.id` |
| `email` | `auth.users.email` | unique. An account without one is refused, with its line |
| `password_hash` | `auth.users.encrypted_password` | bcrypt, unchanged. Null when GoTrue holds an empty string |
| `email_confirmed_at` | `auth.users.email_confirmed_at` | |
| `created_at` | `auth.users.created_at` | UTC without a zone on MySQL and SQLite, like every timestamp of the export |

The table is not part of `TABLES` in `schema.ts`: it does not exist in our database, and the
guard against `information_schema` would refuse it there.

## Errors

| Situation | Result |
|---|---|
| The target already holds one of the addresses | The insert fails, and no account is written |
| An account in the dump has no address | The export stops and names the account and its line |
| The dump has no `auth.users` row | No accounts file; the command says every person will have to sign up again |

## Personal data

The dump and every `<target>-accounts.sql` hold password hashes: they are written in `data-out/`,
which `.gitignore` excludes, and are deleted once applied. `<target>-data.sql` still holds no
hash, and a test checks it. The transfer is recorded in `docs/gdpr/registre.md`, T-01.

## How to verify

```
npx vitest run packages/data-migration/src/accounts.test.ts
npm run test:migration
```

`test/migration/accounts.migration.test.ts` exports two accounts to PostgreSQL 17, MySQL 8.4 and
SQLite. It reads each hash back from the target and checks it with pgcrypto's `crypt()`: it
accepts the original password and refuses another. Applying the file a second time fails and
leaves two accounts.

Run on 2026-09-24 against a dump of the local stack: the two demo accounts, created by GoTrue,
arrived in the three engines, and each hash accepted `DemoLegacy2026`.

## Known limits

- The target needs its own sign-in code, with a bcrypt library to compare passwords with the
  hashes. Nothing in this repository provides it for MySQL or SQLite.
- Everyone signs in again once: sessions do not cross.
