# ADR-0004 — Supabase as the database, local stack in development and in CI

- **Status**: Accepted
- **Date**: 2026-09-02, amended on 2026-09-03
- **Deciders**: whole team, kickoff meeting
- **Related issue**: #2

## Context

The legacy code ships **two** engines, MySQL and SQLite, without owning either: the choice is
made as a side effect of the presence of an environment variable (`DET-02`). The default database
path is `/etc/todos/todo.db`, a system directory, which makes a local start fail without
privileges (`DET-21`).

ADR-0001 requires membership across several accounts, hence authorization per row and not per
resource. ADR-0008 requires authentication. The choice of engine is the same subject as those
two, not a separate one.

## Options considered

### Option A — Plain PostgreSQL, in a container
- Pros: the types and constraints the model needs, a single engine owned, no dependency on a
  provider.
- Cons: authentication and row-level authorization remain entirely to be written, while they are
  the easiest points to get wrong and the most heavily graded.
- It was the recommendation of the backlog (`D-07`).

### Option B — Supabase
- Pros: it is PostgreSQL, plus authentication (ADR-0008) and RLS policies, which answer exactly
  the cost introduced by ADR-0001. The CLI provides migrations as versioned files.
- Cons: dependency on a provider; a local stack heavier than a single `postgres` container.

### Option C — Stay on SQLite
- Discarded: neither the types, nor the constraints, nor row-level authorization. Reproduces
  `DET-27`.

## Decision

We choose **option B — Supabase**.

**Amendment of 3 September**: the Supabase stack runs **locally** (`supabase start`) in
development and in continuous integration. The hosted project only serves as a deployment
target.

Because:

1. We get PostgreSQL — the engine the recommendation aimed at — and on top of it authentication
   and row-level authorization, that is precisely the work ADR-0001 makes expensive.
2. The CLI versions the schema as SQL files (`supabase/migrations/<timestamp>_<name>.sql`,
   created by `supabase migration new`). The graded point is schema versioning: the tool
   satisfies it, with no convention to maintain.
3. The amendment: six people and the CI writing into a single hosted database would make the
   integration tests non-reproducible — a suite would turn green by chance. One stack per
   workstation and per run removes the question.

## Consequences

**Positive**
- A single engine owned, instead of two endured.
- `supabase db reset` replays every migration: the state of the database can be reproduced from
  the repository alone.
- `supabase db push` deploys the same SQL to the hosted project: development and the target
  share their migrations.

**Negative / accepted debt**
- Docker becomes a workstation prerequisite. It already was for Redis (ADR-0007) and for the
  deliverable image (`EN-08`), so it is not a new prerequisite — but the start time of the stack
  adds to that of the other two.
- Dependency on a provider. Mitigation: the core is a standard PostgreSQL and the migrations are
  SQL. What is really proprietary is authentication, isolated behind the port of the `auth`
  domain (ADR-0003, ADR-0008).
- Starting the stack in CI consumes Actions minutes, limited by the free quota. To be enabled
  only with `EN-25`, when integration tests actually exist.

**What it imposes on the rest of the project**
- `EN-03` orchestrates the local stack, Redis, the API and the front end in one command.
- `EN-09` removes the two legacy drivers and any `CREATE TABLE` at startup.
- `EN-30` documents the connection variables in `.env.example`; `EN-08` expects them in the
  image.

## How we will know we were wrong

If `supabase start` costs more time than it saves on the workstations — slow start, insufficient
memory, back-and-forth to get it running again — we replace the local stack with a plain
`postgres` container and keep the hosted project for authentication. The SQL and the migrations
remain valid without modification.

## References

- `docs/backlog.md`, decision `D-07`
- `docs/audit-legacy.md`, debts `DET-02`, `DET-21`, `DET-26`, `DET-27` (`SP-00`, PR #107)
- https://supabase.com/docs/guides/local-development/overview
