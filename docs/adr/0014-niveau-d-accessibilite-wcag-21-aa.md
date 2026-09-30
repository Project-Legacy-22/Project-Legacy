# ADR-0014 — WCAG 2.1 AA as the target level

- **Status**: Accepted
- **Date**: 2026-09-11
- **Deciders**: team, at the sprint 2 review
- **Related issue**: #228, decision `D-15`

## Context

The target accessibility level conditions the acceptance criteria of every front-end story. It
had never been ratified, while the code applies it: every `axe-core` pass of the repository runs on
the tags `wcag2a`, `wcag2aa` and `wcag21aa`, and the contrast test computes the relative luminance
with the WCAG thresholds — 4.5:1 for text, 3:1 for components.

`docs/features/15-accessibility-audit.md` itself notes `D-15` as "still unratified" while
complying with it. A requirement enforced by the CI without being decided can be undone without
discussion.

## Options considered

### Option A — WCAG 2.1 AA
- Pros: it is the reference level of the European legal obligations, and the one the tooling
  already checks without additional configuration.
- Cons: contrast and keyboard journeys require real work on every screen.

### Option B — WCAG 2.1 A
- Pros: fewer criteria.
- Cons: drops contrast, which is the most common and most visible defect.

### Option C — No level, case by case
- Cons: no verifiable acceptance criterion, and an accessibility that depends on the reviewer.

## Decision

We choose **option A**, WCAG 2.1 AA.

Because it is already what the CI enforces, so ratifying it costs nothing and discarding it would
mean undoing delivered work. And because the subject assesses accessibility: a named level gives
verifiable criteria instead of an opinion.

## Consequences

**Positive**
- Every front-end story inherits acceptance criteria verifiable by `axe` and by the contrast test.

**Negative / accepted debt**
- `color-contrast` stays disabled in the `axe` passes, since jsdom resolves no cascade. Contrast
  is covered in another way, by the test that reads the colour tokens.
- Deviations found and not corrected are tracked by dated issues, not by report lines.

**What it imposes on the rest of the project**
- A screen delivered without an `axe` pass is a non-compliant screen, and is treated as a defect.

## How we will know we were wrong

A criterion of the level that can be checked neither by `axe` in jsdom nor by a test on the tokens,
and that would therefore require a browser — the signal that would bring in `EN-26`.
