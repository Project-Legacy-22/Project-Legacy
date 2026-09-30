# ADR-0021 — Reassigning the owner of a shared project when their account is erased

- **Status**: Accepted
- **Date**: 2026-09-25
- **Deciders**: team
- **Related issue**: #425

## Context

Before this decision, `erase_account` already deleted every row naming the erased account:
memberships, queued events, then the account itself. The tasks of a shared project followed the
same fate as the account that had created them: `items.user_id` was `not null` with
`on delete cascade`, so that erasing one's own account also erased the tasks created in a project
shared with other members, while those members still had access to them the minute before.

A project whose erased account was the only owner raises a second question, distinct from the
first: `project_memberships` imposes no constraint on the number of owners or on their
permanence. Without an explicit rule, such a project would remain without an owner after the
erasure, while it still has members.

The same mechanism affected a third table, found while writing the integration test of this
decision rather than while reading the schema: `project_invitations.invited_by` was also
`not null` with `on delete cascade`. Erasing the account that invited someone deleted the
invitation, which in turn deleted in cascade the notification the invited person had already
received (`notifications.invitation_id` references `project_invitations` in cascade) — including
in a project the erasure otherwise leaves intact.

## Options considered

### Option A — change nothing, document the loss as a known limit
- Pros: no code to write.
- Cons: a member loses their own work through the sole decision of another account; the privacy
  policy (US-37) promises to keep the data of other people, which this loss directly contradicts.

### Option B — transfer the erased account to an anonymous system account
- Pros: `user_id` stays `not null`, no constraint migration.
- Cons: a system account that exists in no authentication flow is a fiction to maintain everywhere
  `user_id` is read as a real account (notifications, authorization); it introduces an exception
  to document without any measurable benefit over the first option.

### Option C — nullable `user_id` with `on delete set null`, and reassignment of the oldest member
as owner when the erased account was the only one
- Pros: the task remains, with a link to its creator broken by construction rather than
  simulated; a project with several members never ends up without an owner; the reassignment rule
  is deterministic and requires no input at the time of the erasure.
- Cons: `user_id` becomes nullable, which moves the burden of non-nullity onto every read that
  implicitly depended on it (found and fixed site by site during implementation: `Item.ownerId`,
  `itemCreated`).

## Decision

We choose **option C**, and apply the same treatment as for `items.user_id` to
`project_invitations.invited_by`: it becomes nullable with `on delete set null` instead of
`on delete cascade`. The invitation and the notification it produced survive the erasure of the
person who invited; only the link to that person is broken.

Because: authorization to access a project is already carried entirely by `project_memberships`
(confirmed by reading the existing RLS policies, which do not reference `items.user_id`) — making
this field null therefore removes no right from anybody; the "oldest member" criterion requires no
external input at the time of the erasure, an action that must stay immediate; and an explicit,
tested reassignment is better than an ownerless project discovered later through a behaviour that
fails silently. The same logic applies to `invited_by`: nothing authorizes or displays anything
from this field apart from the address shown to the invited person, which simply becomes absent.

## Consequences

**Positive**
- A member of a shared project no longer loses access to a task merely because another member
  erased their account.
- A project with several members always keeps an owner after the former one is erased.
- A pending invitation, and the notification it produced, no longer disappear because the person
  who invited erased their account — as long as the project itself survives.

**Negative / accepted debt**
- With `items.user_id` and `project_invitations.invited_by` nullable, the typing of
  `Item.ownerId` and `PendingInvitation.invitedByEmail` (`string | null`) makes visible, wherever
  they are read, that a row may have outlived its author. Every existing site was reviewed during
  implementation; a future site that assumes either one non-null without checking it is a bug, not
  an accepted consequence of this decision.
- Once either field is set to `null`, no trace allows finding which account had created the task
  or sent the invitation: both the reassignment and the broken link are irreversible by
  construction.

**What it imposes on the rest of the project**
- Every new read of `items.user_id` or of `project_invitations.invited_by` (or of their domain
  equivalents) must treat the null case as a normal state, not an error.
- The reassignment criterion (oldest remaining member, by `project_memberships.created_at`) is
  written only once, in `erase_account`; it is not duplicated on the application side.

## How we will know we were wrong

A project with several members ends up without an owner after an erasure, observed in production
or in integration; access to a task is refused to a legitimate member because of a `user_id` that
became null; or an invitation notification disappears for its recipient after the erasure of the
person who invited, while the project survives.

## References

- `supabase/migrations/20260925090000_preserve_shared_project_items_on_erasure.sql`
- `supabase/migrations/20260925093000_preserve_invitations_on_inviter_erasure.sql`
- `apps/api/test/integration/account-erasure.integration.test.ts`
- `scripts/check-project-invitations.sql`
- `docs/gdpr/registre.md`, sections T-03, T-07 and T-10
