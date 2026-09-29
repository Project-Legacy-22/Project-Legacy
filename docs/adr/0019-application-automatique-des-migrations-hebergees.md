# ADR-0019 — Automatic application of the migrations to the hosted database

- **Status**: Accepted
- **Date**: 2026-09-23
- **Deciders**: team
- **Related issue**: #385, extends ADR-0005

## Context

ADR-0005 versions the schema as SQL migrations. It does not say who applies them to the hosted
database. Nobody is in charge of it: on 23 September, six migrations merged into `dev` had never
reached the database, the code of #382 read a missing column, and the previews answered 500
(#385).

One constraint weighs on the choice: production and the previews share a single Supabase project,
on the free plan (ADR-0017).

## Options considered

### Option A — manual application by a designated person
- Pros: no database secret in the CI.
- Cons: it is the situation that produced the incident; the person can be absent, and nothing
  reports the omission before the first 500 error.

### Option B — application at release, in the workflow of `main`
- Pros: the migration ships with the code that uses it.
- Cons: the database being shared, the previews of `dev` already read the new code without the
  migration, until the next release.

### Option C — application after each green `ci` run on `dev`
- Pros: a merged migration reaches the database within minutes; it has already been replayed on
  an empty database by `ci`; the list of what goes out is written in the summary of the run.
- Cons: a migration reaches production before the code that uses it; database access secrets in
  the CI.

### Option D — one Supabase project per environment
- Pros: isolates the previews from production.
- Cons: a second project to configure, back up and keep up to date, and duplicated secrets in
  Vercel and in the CI; for the previews of a three-sprint project, the cost exceeds the risk that
  the additive rule already covers.

## Decision

We choose **option C** (`migrations` workflow), with a rule that is part of the decision: **a
migration is additive**.

Because: the incident came from the absence of an owner, and an automatic trigger is one; `ci` has
already applied each migration to an empty database before it arrives here; and the constraint of
the shared database is handled by a writing rule rather than by a second project to maintain.

The rule: a migration must remain compatible with the code already released, since it reaches
production before it. Add a table, a column with a default value or a function, or redefine a
function without changing its signature. A rename, a removal or a signature change happens in two
steps: the migration that adds, released; then, once the code that no longer reads the old one is
released, the one that removes.

## Consequences

**Positive**
- A merged migration reaches the database without anyone having to think about it. The
  application can be replayed without effect when the database is up to date.
- Two applications do not overlap: the concurrency group queues them, without ever cancelling
  one.
- The commit applied is the one `ci` checked, not the head of `dev` at start time.

**Negative / accepted debt**
- The CI holds `SUPABASE_ACCESS_TOKEN`. The token and the password go through the environment,
  never as an argument.
- A destructive migration merged by mistake would break production. Review and the additive rule
  are the only protections, with the backup (`npm run backup`, `docs/backup-and-exit.md`) to roll
  back.

**What it imposes on the rest of the project**
- Every migration is reviewed against the additive rule.
- `docs/ci.md`, section "Migrations of the hosted database", holds the configuration and the rule.

## How we will know we were wrong

An additive migration breaks production anyway, because the released code depended on a behaviour
it changes; or the team must regularly suspend the workflow to release a change in two steps. In
both cases, a separate project for the previews becomes worth studying again, even a paid one.

## References

- `.github/workflows/migrations.yml`
- `docs/ci.md`, section "Migrations of the hosted database"
- ADR-0005 (versioned migrations), ADR-0017 (hosted Supabase)
