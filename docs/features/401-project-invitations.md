# Invite someone into a project

- **Issue**: #401, delivered by #402 (data, use cases and routes), #403 (event and
  notifications by kind) and #404 (members screen and answer from the notification);
  #420 invites one or several people at once, including when creating a project
- **Epic**: Projects
- **Delivered**: 2026-09-24
- **Decisions that apply**: ADR-0001, ADR-0003, ADR-0005, ADR-0007, ADR-0013, ADR-0021

## What it does

A project owner invites a person by the address of their account. The person invited
receives a notification naming the project, and accepts or declines from it. Accepting
makes them a member and the project appears in their list; declining leaves them out.

Nobody enters a project without agreeing to. An owner cannot add someone directly from
the interface, and a pending invitation grants no access to the project.

## Surface

| Endpoint | Purpose | Auth |
|---|---|---|
| `POST /projects/:projectId/invitations` | Invite by address. `201` when an invitation is created, `200` when the person is already a member or already invited | session required, owner only |
| `GET /projects/invitations` | The caller's pending invitations, with project name and the inviter's address | session required |
| `POST /projects/invitations/:invitationId/accept` | Accept: `204`, and the caller becomes a member | session required, invitee only |
| `POST /projects/invitations/:invitationId/decline` | Decline: `204` | session required, invitee only |

Shapes are governed by `packages/contracts/src/invitations.ts` (`InviteMemberBody`,
`InvitationOutcomeDto`, `PendingInvitationListDto`) and by `NotificationDto`, which now
carries the notification's `kind`, its project and, for an invitation, the invitation and
its current status. `docs/api/openapi.json` documents all four operations.

## Data

Migration `20260924100000_project_invitations` adds `public.project_invitations`: the
project, the person invited, the person who invited, a status (`pending`, `accepted`,
`declined`) and the answer date. A check keeps the status and the answer date consistent,
and a partial unique index allows a single pending invitation per person and project;
a new one is possible after a refusal. The table has row level security, and a session
can only read the invitations addressed to it.

`public.notifications` gains `invitation_id`, and its kind check now covers three kinds.

Three functions, executable by `service_role` only, keep each write in one transaction:

- `invite_member_with_event` writes the invitation and its event together, and answers
  `invited`, `already_member` or `already_invited`;
- `respond_to_invitation` locks the invitation, refuses anyone but the person invited,
  records the answer and, on acceptance, writes the membership;
- `record_invitation_notification` claims the event and writes the notification, once.

## Events

Inviting publishes `invitation.created.v1` (see `docs/events/catalog.md`). The consumer
writes the notification of the person invited. Its payload carries identifiers only.

## Errors

| Situation | Response | Note |
|---|---|---|
| Caller outside the project, or project absent | `404 project_not_found` | indistinguishable, so the route does not reveal a project |
| Caller is a member but not an owner | `403 not_project_owner` | they already know the project exists |
| No account carries the address | `404 account_not_found` | explicit, so a typo can be corrected |
| Body is not an address | `400 validation_error` | |
| More than twenty invitations in fifteen minutes | `429 too_many_attempts` | keyed on the account |
| Answering an invitation addressed to another account | `404 invitation_not_found` | the invitation does not exist for them |
| Answering an invitation already answered | `409 invitation_already_answered` | |

Refusing an unknown address explicitly makes the route an oracle for which addresses
are registered. It requires a session, and the per-account budget bounds it.

## Screens

- **Project creation** has an optional *Invite people* field. Once the project exists,
  each address is invited in turn, and one message says who was invited, who already
  was, and who could not be and why. A failed invitation does not undo the project; it
  can be sent again from the members panel.
- **Members of a project**, below the project list, collapsed behind *Show members* and
  fetched only once opened. It lists each member with their role and marks the reader.
  An owner sees an invitation field and a *Remove* button on the other members; a member
  sees the list only.
- Both invitation fields take one or several addresses separated by commas, semicolons
  or spaces, at most 20 at once, the API's budget per account. Every address is checked
  against the same contract as the API before anything is sent; what is not an address
  is named and nothing is sent. The outcome of each address is announced in a polite
  live region; in the members panel, the addresses that were not invited stay in the
  field with their reason, for correction.
- **Notifications** are worded by kind: a created task, being added to a project, being
  invited to one. A pending invitation offers *Accept* and *Decline*, native buttons
  whose accessible name includes the project. Answering marks the notification read,
  replaces the buttons with the answer and announces it; accepting selects the project
  in the list.

## Personal data

The invitation links two accounts and a project, by identifier. The address typed by the
owner is neither stored, logged nor placed in the event. The inviter's address is shown to
the person invited, read on demand from `public.users`. An invitation is deleted with its
project or with the invitee's account. Erasing the inviter's account (#425, ADR-0021) only
breaks the link to it: the invitation and the notification it produced stay for the person
invited, with `invited_by` set to null rather than an address that no longer exists. See
`T-10` in `docs/gdpr/registre.md`.

## How to verify

Against a disposable local Supabase stack with all migrations applied:

```sh
npm run test:unit -- packages/core/projects packages/infra/src/event-consumer.test.ts
npm run test:http -- invitations.test.ts
npm run test:integration -- invitations.integration.test.ts
npm run test:dom -- app-invitations.test.tsx app-project-invitations.test.tsx email-list.test.ts members-api.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
```

The schema check includes `check-project-invitations.sql`, which exercises inviting,
duplicates, idempotent notification, answers by another account, acceptance, a second
answer, refusal and erasing the inviter of a project that keeps another member, inside
rolled-back transactions. The integration test goes through the real API, database and
event flow: invite, deliver, read the notification, accept, see the project.

## Known limits

- Account erasure removes invitations through the foreign keys, but not the
  `invitation.created.v1` rows still in the outbox, because erasure finds outbox rows by
  `ownerId` only. `membership.created.v1` has the same gap. The outbox purge removes them
  after publication.
- An owner cannot withdraw a pending invitation, nor see the pending ones in the members
  panel. It stays until the person answers.
- The interface does not let an owner remove themselves: it creates no second owner, so
  that removal would always be refused as the last owner's.
