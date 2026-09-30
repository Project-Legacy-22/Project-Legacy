# ADR-0020 — Serverless relay through a thirty-second loop

- **Status**: Accepted
- **Date**: 2026-09-24
- **Deciders**: team
- **Related issue**: #410, extends ADR-0013

## Context

On Vercel, no process runs between two requests. ADR-0013 requires every target to run a relay
pass; the serverless target does it after each write that produces an event
(`apps/api/src/after-write.ts`) and through a scheduled call to `POST /internal/relay` from the
`relais` workflow, declared every five minutes.

On 24 September, two findings. The invitation into a project was not wired to the after-write
pass, and therefore relied entirely on the scheduler. The scheduler, for its part, does not keep
its frequency: the scheduled passes took place at 21:41, 23:58, 03:39 and 08:44. A notification
could therefore arrive several hours after its fact. Two test invitations were only delivered
after a manual trigger.

## Options considered

### Option A — keep the five-minute cron
- Pros: nothing to change.
- Cons: five minutes is the minimum GitHub accepts, and it does not honour it; the real latency is
  counted in hours.

### Option B — Vercel cron
- Pros: as close as possible to the deployment.
- Cons: one run per day on the free plan.

### Option C — a GitHub Actions job that loops and restarts itself
- Pros: a pass every thirty seconds, kept by the job itself and not by the scheduler; no
  additional service; minutes are not counted on a public repository.
- Cons: a runner permanently busy; a gap of a few seconds at each handover; the chain depends on
  the restart through `workflow_dispatch`.

### Option D — an external scheduler (cron-job.org, Upstash QStash)
- Pros: frequency kept without a busy runner.
- Cons: one more processor, which would hold the relay secret and would have to enter the GDPR
  register.

## Decision

We choose **option C**, with the after-write pass extended to the invitation.

Because: the thirty-second frequency is kept by the job and not by a scheduler that does not keep
its own; it adds no service, no secret outside GitHub, and no recipient in the register; and the
after-write pass remains the normal path, the loop catching up with what it misses.

## Consequences

**Positive**
- A notification arrives within a second of the write, and at most thirty seconds after it when
  the after-write pass failed.
- The measurements are pushed every ten passes, summed: same information, ten times fewer series
  than pushes per pass.

**Negative / accepted debt**
- A job runs continuously. If the repository became private, it would consume about 43,000
  minutes per month and this decision would have to be revisited.
- The handover leaves a gap of a few seconds every 345 minutes.

**What it imposes on the rest of the project**
- Every new use case that writes an event goes through `afterWrite` in `composition-root.ts`, with
  a test that checks it (`item-use-cases.test.ts`, `project-use-cases.test.ts`).
- The loop only restarts after running to its end; a missing variable stops it without a restart,
  so as not to chain empty runs.

## How we will know we were wrong

The history of the `relais` workflow shows more than one loop running at a time, or a period
without an active loop longer than a few minutes; or `legacy22_outbox_pending` stays above zero
for more than a minute on the dashboard.

## References

- `.github/workflows/relay.yml`, `scripts/relay-loop.mjs`, `test/relay-loop.test.ts`
- GitHub documentation: events triggered by `GITHUB_TOKEN` do not create a new run, with the
  exception of `workflow_dispatch` and `repository_dispatch`.
