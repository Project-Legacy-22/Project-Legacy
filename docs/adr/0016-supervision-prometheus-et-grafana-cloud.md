# ADR-0016 — Prometheus as the format, Grafana Cloud in Germany as the platform

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: team, after the intermediate defense
- **Related issue**: #276

## Context

The intermediate defense asks for a monitoring platform to be chosen before the end of the
project, and for the decision to be carried by an ADR naming the needs, the solutions compared, the
data collected, the costs and the limits.

Nothing exists today: no metric is exposed, and the only observability is the Vercel runtime log,
which is read by hand and keeps nothing durable.

What we need to be able to see, in the order of what actually was missing during sprint 2:

- whether a route responds, with which code and in how long — the 500 errors of `/auth/me` and of
  `/auth/login` were found by chance, while reading logs;
- whether the outbox drains — ten events stayed stuck behind a single unconsumable one without
  anything reporting it;
- whether a delivery pass fails, and how many events it applies.

## Options considered

### Option A — Self-hosted Prometheus, local only
- Pros: no account, no dependency, no transfer. A container in `compose.yaml` is enough to
  demonstrate the chain.
- Cons: nothing is observed on the deployment, so monitoring only serves the demonstration. No
  retention between two `docker compose down`.

### Option B — Grafana Cloud, Prometheus format
- Pros: free tier, retention, dashboards and alerts without a server to maintain. The format stays
  Prometheus, so the exit cost is that of a change of address.
- Cons: one more provider, and a region to choose — see the constraint below.

### Option C — Vercel observability alone
- Pros: already there, nothing to configure.
- Cons: no business metric, no alert on the outbox depth, and a short retention on the free tier.

## Decision

We choose **Prometheus as the format** and **option B for the deployed target**, with option A
kept for the local demonstration: a Prometheus container in `compose.yaml` scrapes the
application, and Grafana Cloud receives what the deployment can push.

Two constraints are part of the decision, not of its commentary.

**The region.** The stack is in Germany, region `prod-eu-west-2`, checked on 12 September 2026 on
the URL of its Prometheus data source. A Grafana Cloud stack does not change region after
creation: the region is therefore chosen before connecting anything, and that choice is part of the
decision.

**No personal data.** A metric carries neither an account identifier, nor an address, nor a task
title, nor an IP address, as a value or as a label. What goes out is a counter or a duration,
aggregated by route and by status code. This is why Grafana Labs, an American company, receives no
personal data despite a European stack.

## Consequences

**Positive**
- A route that breaks is seen, instead of being found by chance while reading a log.
- The outbox depth becomes observable, hence alertable.
- The format being Prometheus, changing platform comes down to changing a write address.

**Negative / accepted debt**
- On the serverless target, a counter restarts from zero at each invocation: process metrics make
  no sense there, and only the measurements pushed per request are usable. It is the same
  constraint as the one that prevents the relay from running there (ADR-0013).
- The free tier limits retention and the number of series. A high-cardinality label — a task
  identifier, for example — would saturate it, which the rule above forbids anyway.
- One more provider to declare in the register and in the privacy policy.

**What it imposes on the rest of the project**
- Every metric added passes the same rule: no label may identify a person or an object they
  created.
- The demonstration of the event flow happens locally, where Prometheus actually scrapes.

## How we will know we were wrong

A failure found in the logs while a metric existed to see it. Or a series whose cardinality
explodes, a sign that a label carries something identifying.

## References

- Measured region: URL of `grafanacloud-prom`, `prod-eu-west-2`, 12 September 2026
- ADR-0013 (what prevents a long-running process on the serverless target)
- `docs/gdpr/registre.md`, section "Processors and location"
