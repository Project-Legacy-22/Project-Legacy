# ADR-0005 — Data access through the Supabase client, schema versioned as migrations

- **Status**: Accepted
- **Date**: 2026-09-02
- **Deciders**: whole team, kickoff meeting
- **Related issue**: #2

## Context

The legacy schema is created at startup by an inline `CREATE TABLE IF NOT EXISTS`, run by each
driver, without versioning (`DET-26`). It has no primary key, no index and no constraint: two
rows can share the same identifier (`DET-27`).

The point assessed by the subject is **schema versioning**, not the tool chosen to write the
queries.

## Options considered

### Option A — Hand-written SQL
- Pros: full control, no layer to explain.
- Cons: a lot of repetitive code, and a risk of injection as soon as discipline on building
  queries slackens.

### Option B — Query builder of the Supabase client
- Pros: readable, parameterised queries, no implicit behaviour. The client is already present
  for authentication and RLS (ADR-0004, ADR-0008).
- Cons: does not cover complex queries; the API is specific to Supabase.

### Option C — Full ORM (Prisma, TypeORM)
- Pros: fast to start with, built-in migrations.
- Cons: implicit behaviours — lazy loading, cascades, generated queries — hard to explain at the
  defense, and which hide what the subject asks us to demonstrate.

## Decision

We choose **option B — the query builder of the Supabase client**, with the schema versioned as
SQL migration files.

Because:

1. The graded point is versioning, and the CLI satisfies it: `supabase migration new` creates a
   timestamped file in `supabase/migrations/`, `supabase db reset` replays them all,
   `supabase db push` applies them to the target.
2. The Supabase client is already present for authentication and for RLS. Adding a second one
   only for the queries would make two truths coexist about the connection and about the
   identity of the caller — hence two places where authorization can diverge.
3. A full ORM would require defending at the defense queries we would not have written.

## Consequences

**Positive**
- No more `CREATE TABLE` at startup: the initialisation function of the legacy disappears with
  `EN-09`.
- Every schema change is a file reviewed in a pull request, reversible and dated.
- The client applies the RLS policies with the identity of the caller: the authorization of
  ADR-0001 is enforced at the database level, not only in the routes.

**Negative / accepted debt**
- The query builder does not cover everything. A complex query goes through a SQL function
  versioned in a migration, **not** through a hand-built string.
- The client API is specific to Supabase. Mitigation: the queries stay behind the port of the
  domain (ADR-0003), so a replacement is limited to one adapter.

**What it imposes on the rest of the project**
- `EN-09` delivers the initial migrations with primary keys, indexes and constraints — the three
  things missing in `DET-27`.
- No schema change applied by hand on a hosted project: it would be invisible from the repository
  and impossible to replay.

## How we will know we were wrong

If more than a quarter of the accesses have to bypass the query builder with raw SQL, the need is
that of a general-purpose SQL tool: we replace the adapter with a full query builder. The
migrations remain valid — which is what makes that change cheap.

## References

- `docs/backlog.md`, decision `D-06`
- `docs/audit-legacy.md`, debts `DET-26`, `DET-27` (`SP-00`, PR #107)
- https://supabase.com/docs/guides/local-development/overview
