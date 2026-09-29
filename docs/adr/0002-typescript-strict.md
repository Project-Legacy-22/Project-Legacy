# ADR-0002 — Strict TypeScript across the whole repository

- **Status**: Accepted
- **Date**: 2026-09-02
- **Deciders**: whole team, kickoff meeting
- **Related issue**: #2

## Context

The legacy code is JavaScript without annotations, without JSDoc, without a `tsconfig.json` (debt
`DET-16`). The subject explicitly names "the current level of typing" among the points to examine
and correct: it is therefore an assessed debt, not a team preference.

Two members have no significant experience with TypeScript.

## Options considered

### Option A — Strict TypeScript
- Pros: errors caught at compile time, explicit contracts between modules, mature tooling.
- Cons: a real learning cost, a mandatory compilation step.
- Learning cost: a few days, paid at the start of sprint 1.

### Option B — Typed JSDoc
- Pros: less friction, no compilation step.
- Cons: weaker guarantees, more fragile tooling, and above all an ambiguous signal sent to the
  assessment — we would answer a named debt only halfway.

### Option C — Stay in JavaScript
- Reproduces exactly the debt we are supposed to correct.

## Decision

We choose **option A — strict TypeScript**, with `noUncheckedIndexedAccess`.

Because:

1. It is a debt named by the subject. Correcting it halfway would cost almost as much as
   correcting it fully, for a result that cannot be defended.
2. The learning cost is paid once, and at the best time: at the start, on new code, not on a
   codebase to migrate.
3. Typing makes the split of ADR-0003 **verifiable**: a forbidden import between layers becomes a
   compilation error rather than a convention recalled at review.

## Consequences

**Positive**
- Module boundaries are checked mechanically (`scripts/check-layers.mjs`).
- External data is validated at the entry point with schemas that also produce the types: a single
  source of truth for the contract.

**Negative / accepted debt**
- A mandatory compilation step, hence a multi-stage Docker image and a longer CI run.
- Type-aware linting requires the projects to be **built** before they are analysed. Observed
  while integrating `EN-05` and `EN-06` on 3 September: the CI runs `typecheck` before `lint`,
  and not the other way round.
- Two people work with a tool they discover during a graded sprint.

**What it imposes on the rest of the project**
- `strict` and `noUncheckedIndexedAccess` are enabled from the first `tsconfig.json`: enabling
  them later would mean rewriting the code already produced.
- Every `any` or `@ts-expect-error` carries a comment justifying its presence.

## How we will know we were wrong

If by the middle of sprint 2 unjustified `any` and `@ts-expect-error` appear faster than they are
removed, the problem is not TypeScript but poorly defined boundary contracts. We fix the
contracts; we do not relax the compiler, which would make typing decorative.

## References

- `docs/backlog.md`, decision `D-03`
- `docs/audit-legacy.md`, debt `DET-16` (delivered by `SP-00`, PR #107)
- Team standards, `standards/02-code-style.md`
