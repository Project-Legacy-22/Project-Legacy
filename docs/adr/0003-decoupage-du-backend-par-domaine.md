# ADR-0003 — Backend split by domain, in layers inside each domain

- **Status**: Accepted
- **Date**: 2026-09-02
- **Deciders**: whole team, kickoff meeting
- **Related issue**: #2

## Context

The legacy code has no business layer: the Express handlers call persistence directly (`DET-01`),
and the database driver is chosen as a side effect when the module loads (`DET-02`). No rule can
be tested without HTTP or a database.

Six people work in parallel on the same repository for three sprints. The question is therefore
not only "which split is clean" but "which split keeps six people out of the same files".

## Options considered

### Option A — By domain, in layers inside each domain
- Pros: each domain is autonomous; the boundaries can be checked automatically; a module has an
  identifiable owner.
- Cons: more files, more imports, more ceremony for a simple case.

### Option B — By layer only (`controllers/`, `services/`, `models/`)
- Pros: familiar, immediately understood.
- Cons: everybody edits the same three folders. Conflicts are guaranteed with six people, and
  the coupling of the legacy is reproduced identically, one layer higher.

### Option C — Flat, like the legacy
- Discarded: it is debt `DET-01` itself.

## Decision

We choose **option A — split by domain**, in a lightweight hexagonal style: the domain imports
nothing, exposes ports, and the adapters (HTTP, database, bus) are plugged in at the composition
root.

Because:

1. With six people, a horizontal split makes everybody converge on the same three folders. The
   split by domain is what makes ownership per module possible, hence what avoids conflicts — it
   is an organisational choice as much as an architectural one.
2. The rule "`domain/` imports nothing" can be checked by a script, so it holds without relying
   on vigilance at review.
3. An isolated domain is tested without HTTP or a database: this is the condition for tests to
   cover a behaviour rather than a sequence of calls, which the legacy did not allow (`DET-14`).

## Consequences

**Positive**
- A domain communicates with another only through an event or a port, never through a direct
  import.
- Each adapter can be replaced without touching the business code — which makes ADR-0005 and
  ADR-0007 reversible.

**Negative / accepted debt**
- More files and indirection than a CRUD would justify on its own.
- A developer in a hurry will find the shortest path by importing an adapter directly: the
  automatic check is what prevents it, not the convention.

**What it imposes on the rest of the project**
- `packages/contracts` is the only public contract between domains.
- `.github/CODEOWNERS` follows the split: one module, one owner.
- Any new communication between domains is declared as an event or a port, and is discussed — it
  is not added through an import.

## How we will know we were wrong

If a domain becomes a catch-all whose files three people modify in every sprint, the boundary is
misplaced: we split that domain. Going back to a split by layer would bring the problem back
everywhere instead of fixing it in one place.

## References

- `docs/backlog.md`, decision `D-04`
- `docs/audit-legacy.md`, debts `DET-01`, `DET-02`, `DET-14` (delivered by `SP-00`, PR #107)
- Team standards, `standards/01-architecture.md`
