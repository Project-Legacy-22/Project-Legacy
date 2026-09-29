# ADR-0009 — SonarCloud as the quality gate tool, thresholds of the built-in gate

- **Status**: Accepted
- **Date**: 2026-09-04
- **Deciders**: aurelienpochart (EN-17)
- **Related issue**: #18

## Context

`EN-07` runs static analysis, types and tests on every pull request, but nothing measures the
quality of the **new code** or blocks a regression: that is the purpose of `EN-17`.
`standards/07-quality-gates.md` section 4 sets the target on new code only (coverage,
duplication, blocking bugs and vulnerabilities, maintainability rating) and explicitly names
"SonarCloud or equivalent", already chosen as a proposal in `docs/adr/README.md` (decision
`D-10`). The coverage threshold (`D-11`) is proposed there at 70 %, without being decided.

The GitHub organisation `Project-Legacy-22` is on the SonarCloud **Free** plan.

## Options considered

### Option A — SonarCloud, built-in "Sonar way" gate
- Pros: already named by the standards; the GitHub app is already installed on the organisation;
  pull request analysis natively compares against the target branch, so new code is measured
  without additional configuration; free.
- Cons: checked through the API (`qualitygates/select` and `qualitygates/set_as_default`) — the
  Free plan forbids choosing or modifying the gate applied to a project
  (`Organization ... is not allowed to modify Quality gates`). The built-in gate is imposed as
  is, and its thresholds cannot be negotiated without moving to a paid plan.

### Option B — Home-made script (vitest + Git diff)
- Pros: no external dependency, thresholds entirely chosen by the team.
- Cons: reimplements what a dedicated tool already does; measures neither duplication nor
  maintainability, only coverage; the standard explicitly names a dedicated tool, and moving
  away from it without a strong reason would contradict `07-quality-gates.md`.

### Option C — SonarCloud with a custom gate
- Discarded: impossible on the Free plan (checked through the API, see Option A). Would become
  possible again on a paid plan.

## Decision

We choose **option A — SonarCloud, built-in "Sonar way" gate**, as is.

Because:

1. It is already the proposal of the standard and of the kickoff meeting; the infrastructure
   (organisation, GitHub app) already exists.
2. The Free plan leaves no choice of a custom gate: writing an ADR for a technically unavailable
   option would have decided nothing.
3. "Sonar way" is **stricter** than the initial proposal on the only metric that differs
   (coverage), never more lenient: accepting its thresholds weakens no requirement of the
   standard.

Thresholds actually applied, on new code only (checked through the API `qualitygates/list`):

| Metric | Threshold |
|---|---|
| Coverage | ≥ 80 % (`D-11` proposed 70 %; the imposed gate is stricter) |
| Duplication | ≤ 3 % (identical to the proposal) |
| Reliability rating | A |
| Security rating | A |
| Maintainability rating | A (identical to the proposal) |
| Security hotspots reviewed | 100 % |

## Consequences

**Positive**
- Verdict published automatically on every pull request by the SonarCloud GitHub app, without
  additional configuration.
- New code is isolated natively by pull request analysis: no diff script to maintain.
- Thresholds stricter than the initial proposal, without additional effort.

**Negative / accepted debt**
- The actual coverage threshold (80 %) is not the one proposed in the backlog (70 %): `D-11` is
  closed by this ADR on that value, imposed by the platform and not chosen.
- No custom gate is possible as long as the organisation stays on the Free plan: a metric the
  team would want to add or relax later (for example `D-11` at a different value) would remain
  out of reach without a change of plan.
- Actually blocking the merge (acceptance criterion of `EN-17`) requires making the SonarCloud
  check mandatory in the protection of the `dev` branch: a repository configuration action,
  distinct from this ADR.

**What it imposes on the rest of the project**
- Any PR that would degrade the coverage, the duplication, or a quality rating on the code it adds
  or modifies will be reported by this gate; below 80 % coverage on new code, the PR fails the
  gate.

## How we will know we were wrong

If the Free plan becomes limiting in some other way than this single point (for example an
analysis quota, report retention), or if the team finds 80 % coverage too expensive to maintain
on adapters that are hard to test (see `packages/infra`), question this ADR and assess the cost of
a paid plan rather than work around the gate.

## References

- `docs/backlog.md`, decisions `D-10` and `D-11`
- `standards/07-quality-gates.md`, section 4
- `docs/adr/README.md`, table "What remains to be decided"
