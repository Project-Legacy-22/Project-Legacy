# ADR-0012 — No automatic formatter for now

- **Status**: Accepted
- **Date**: 2026-09-11
- **Deciders**: team, at the sprint 2 review
- **Related issue**: #221

## Context

The repository has neither `prettier`, nor `.editorconfig`, nor any formatting rule in
`eslint.config.js`: formatting holds by convention alone, across 267 TypeScript files.

Measurement of 11 September 2026 on those 267 files:

| What is measured | Result |
|---|---|
| Indentations found | 4, 8, 12, 16 spaces — multiples of 4, without any measured exception |
| Quotes | 11,610 single against 1,094 double, the latter almost all inside strings |
| Lines longer than 100 characters | 446 |

The convention therefore holds by itself for indentation and quotes. The only real deviation is
line length.

## Options considered

### Option A — Adopt prettier now
- Pros: formatting stops being a review topic; the 446 long lines are reformatted at once.
- Cons: reformatting 267 files in one commit makes `git blame` unusable without
  `.git-blame-ignore-revs`, and conflicts with the three open pull requests. The project rules
  also forbid global reformatting in passing during a task.
- Cost: low in tooling, high in history noise at the worst moment.

### Option B — Add formatting rules to eslint
- Pros: no second tool; enforcement stays in the check already in place.
- Cons: the formatting rules of eslint are deprecated in favour of `@stylistic`, so one more
  dependency anyway, and the same reformatting to absorb.

### Option C — Adopt nothing, and let the convention hold
- Pros: no reformatting, no conflict, no dependency.
- Cons: consistency depends on the reviewers; a new contributor has nothing that guides them
  automatically.

## Decision

We choose **option C for sprint 2**, and option A as a candidate for a sprint boundary.

Because the measurement shows no drift to correct: indentation and quotes are uniform without a
tool. And because the cost falls at the wrong moment — three open pull requests and a review the
next day, for a gain that does not show in the delivered code.

## Consequences

**Positive**
- No conflict introduced into the pull requests in progress.
- The history stays readable: no commit touches 267 files without changing behaviour.

**Negative / accepted debt**
- 446 lines exceed 100 characters and will stay that way until a possible adoption.
- Consistency continues to rely on review.

**What it imposes on the rest of the project**
- If adoption is decided, it happens in a commit that contains only the reformatting, with a
  `.git-blame-ignore-revs` that references it, and no pull request open at that moment.

## How we will know we were wrong

A review that discusses formatting instead of behaviour, or a second measurement showing several
indentation widths in the repository.

## References

- Measurement: `git ls-files '*.ts' '*.tsx'`, 11 September 2026
- Style standards of the project, section 3 (naming and form conventions)
