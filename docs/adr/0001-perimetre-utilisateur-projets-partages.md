# ADR-0001 — A project is shared between several accounts

- **Status**: Accepted
- **Date**: 2026-09-02
- **Deciders**: whole team, kickoff meeting. Product Owner: Victor Briez
- **Related issue**: #2

## Context

The legacy code has no notion of a user: `todo_items` carries no owner (debt `DET-28`). Any data
model therefore starts from scratch on this point.

This is the most structuring decision of the project. It determines the schema, the authorization
model, and the cost of every User Story that handles data. It had to be taken before `EN-09`,
which is on the critical path of almost everything else.

Constraints: six people, three sprints, an intermediate review that assesses, among other things,
a demonstrable event-driven workflow.

## Options considered

### Option A — Single user
- Pros: every resource carries an owner, and authorization comes down to "is it mine?". Simple
  schema, simple authorization tests, one branch per case.
- Cons: a Kanban board nobody else sees makes the event-driven demonstration hollow — a
  notification whose only recipient is oneself does not prove decoupling.
- Cost: the lowest. It was the recommendation of the backlog (`D-20`).

### Option B — Shared projects
- Pros: sharing is what makes a project management tool credible, and what gives the events of
  `US-10` a real recipient.
- Cons: a membership table, roles, invitations. Authorization becomes a subject of its own,
  checked per resource and per role.
- Cost: the number of test cases doubles on every US that handles data.

## Decision

We choose **option B — shared projects**, against the recommendation of the backlog.

Because:

1. The event-driven architecture is graded and demonstrated at review. With a single user per
   project, there is nobody to notify: the demonstration shrinks to a side effect on oneself.
2. The extra cost is concentrated in a single place — the model and the authorization layer —
   and paid once, by `EN-09` and `US-11`. It does not spread into the other items.
3. Sharing was classified `Would have` in the backlog. Adding it afterwards would have required a
   model migration in sprint 2 or 3, which is the most expensive scenario.

## Consequences

**Positive**
- The events of `US-10` and `US-18` have a real recipient, hence an observable demonstration.
- Membership is expressed directly as PostgreSQL RLS policies (see ADR-0004), as close as possible
  to the data rather than scattered across the routes.
- `US-16` stops being a hypothetical evolution: it becomes a tested nominal case.

**Negative / accepted debt**
- Every US that handles data carries at least two test cases instead of one: member and
  non-member. This is a recurring cost, not a one-off.
- Authorization is the most frequent flaw in this kind of application. We accept taking that
  risk early, in exchange for systematic tests.
- `EN-09` grows heavier while it is already on the critical path.

**What it imposes on the rest of the project**
- `EN-09` models `projects` and membership with a role **before** any task US.
- Every route checks that the current user is a member of the project, never only the ownership
  of the resource.
- A denied-access test is an acceptance criterion of every data US, not a separate US written at
  the end.

## How we will know we were wrong

If at the sprint 2 review the task US are not delivered and the authorization layer still consumes
time, we freeze sharing to a single role: member, without multiple roles or invitations. The
schema allows it without a migration, only the test surface shrinks. We do not go back to a single
user, which would force a second redesign.

## References

- `docs/backlog.md`, decision `D-20`
- `docs/audit-legacy.md`, debt `DET-28` (delivered by `SP-00`, PR #107)
- `EN-09`, `US-11`, `US-16`
