# ADR-0015 — GHCR as the image registry

- **Status**: Accepted
- **Date**: 2026-09-11
- **Deciders**: team, at the sprint 2 review
- **Related issue**: #228, decision `D-13`

## Context

The subject asks for a Docker image to be published. The registry had never been ratified, while
`.github/workflows/image.yml` has been publishing to GitHub Container Registry since sprint 1,
with a provenance attestation.

## Options considered

### Option A — GHCR
- Pros: already linked to the repository, no additional secret to manage — the token of the
  workflow run is enough — and the provenance attestation is native.
- Cons: ties publication to GitHub, like the rest of the chain.

### Option B — Docker Hub
- Pros: the best known.
- Cons: one more account and secret, pull limits on the free offer, and no attestation.

## Decision

We choose **option A**.

Because it adds no secret to manage, which is the real cost of a second registry in a project of
six people, and because the provenance attestation comes without work.

## Consequences

**Positive**
- A published image can be traced back to the workflow run that produced it.

**Negative / accepted debt**
- The delivery chain depends entirely on GitHub.

**What it imposes on the rest of the project**
- No image is pushed from a workstation: only the workflow run triggered by a push on `main`
  publishes, after replaying the checks.

## How we will know we were wrong

A deployment constraint that would require a third-party registry, or a GHCR limit reached.

## References

- `.github/workflows/image.yml`
