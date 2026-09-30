# Integration tests

Against the system actually assembled: Postgres, PostgREST, GoTrue, migrations applied. No test
double here — `packages/core/*/test/` and `apps/api/src/http/routes/*.test.ts` already cover the
application behaviour against fakes, faster and without external dependencies; this folder covers
what a double cannot prove: that the pieces work once really connected.

## Files

- `support.ts` — composes a real `Application` (`composition-root.ts`), registers and signs in
  real accounts through the real authentication.
- `projects.integration.test.ts` — default project, creation with membership, visibility to
  members, refusal of non-members and deletion cascade.
- `remove-project-member.integration.test.ts` — removal through HTTP, tasks and account kept,
  access to the project revoked through the API and RLS, protection of the RPC.
- `member-removal-concurrency.integration.test.ts` — simultaneous transactions against
  PostgreSQL: the last owner is kept and a caller removed during the wait is refused. Requires
  Docker; the database is identified by the port of the API under test.
  These tests call `/usr/bin/docker` on Linux (WSL included) or
  `/Applications/Docker.app/Contents/Resources/bin/docker` on macOS. They do not look for the
  executable in `PATH`; a test checks the queries and transactions with an empty `PATH`.
- `project-counts.integration.test.ts` — counter aligned with the visible tasks, including for an
  empty project or one that only contains logically deleted tasks. Exercises the real PostgREST
  aggregate used by the API.
- `items.integration.test.ts` — the real HTTP API: CRUD under a project and isolation between
  members and non-members, as the application enforces it.
- `row-level-security.integration.test.ts` — the RLS policies themselves, reached directly through
  PostgREST with the public key and the token of a real account, without going through the API or
  the service role. It is the only suite that actually exercises what the authentication and
  project migrations set up: the safety net if the service role leaks or if a client queries
  PostgREST directly.
- `event-flow.integration.test.ts` — the event flow of `US-10`: a task and its event are written
  in one transaction, so a refused event leaves no task and a refused task leaves no event; and
  the demonstration flow, a task created over HTTP that becomes a notification its owner reads
  through the real relay, broker and consumer.
- `retention-purge.integration.test.ts` — the retention purge (`US-39`): what exceeded its
  duration goes, the rest stays, an event never published is never deleted, a second pass does
  nothing, and the erasure of an account finds its processed events after the purge of its outbox.

## Running

```bash
npm run db:start        # local Supabase stack, migrations applied
npm run test:integration
```

Suite excluded from `npm test`: it needs the local stack, which not everybody runs on every
change. `npm run test:integration` reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_ANON_KEY` from the environment of the process (`supabase status -o env` prints them) and
fails early, naming them, if one is missing.

## Isolation

Each suite creates its own accounts (generated address, `crypto.randomUUID()`) and each test
creates the projects or items it exercises. No test depends on the execution order. A
`npm run db:reset` between two runs is never necessary for the suite to pass, only to start again
from an empty database.
