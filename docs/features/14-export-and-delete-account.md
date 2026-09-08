# Export and delete my personal data

- **Issue**: #14
- **Epic**: GDPR
- **Delivered**: 2026-09-08
- **Decisions that apply**: ADR-0004, ADR-0005, ADR-0007, ADR-0008

## What it does

A signed-in person can download everything the application holds about them as a single JSON
document, and can delete their account outright. The download is assembled while the request
is being served and is never stored, so no copy of it exists anywhere afterwards. The
deletion is immediate: there is no grace period, no reversal, and no administrative undo.
It removes the rows physically rather than flagging them, and it revokes every session the
account had opened, so the browser that asked is signed out along with all the others.

Both actions sit in a section of the item screen rather than behind a settings page. The
deletion names what it destroys, one line per category, and only proceeds once the person
retypes the address the account is registered with.

Out of scope, and deliberately so: projects and project memberships. They do not exist in
the schema yet, and the story that introduces them is US-16 (#17), which is still open.
See **Known limits**.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `GET /auth/me/export` | Serves the caller's data as a JSON attachment | session required |
| `DELETE /auth/me` | Erases the caller's account and everything it owns | session required |
| Section "Export or delete your data" | Both actions, on the signed-in screen | session required |

Neither endpoint takes an identifier. The account is the one the session resolves to, which
is what makes aiming either of them at somebody else impossible rather than merely
forbidden.

Request and response shapes are governed by `DeleteAccountBody` and `PersonalDataExportDto`
in `packages/contracts`. The export route parses its own response through that schema before
sending it, so a document that stopped matching the contract fails here rather than reaching
a person as a file they cannot use.

## Data

The export reads, and the erasure removes, every table that carries an account today.

| Table | Read by the export | Removed by the erasure | Carries the account through |
|---|---|---|---|
| `users` | yes | yes | `id` |
| `items` | yes, soft-deleted rows included | yes, by cascade | `user_id` |
| `notifications` | yes | yes, by cascade | `user_id` |
| `outbox` | no | yes | `payload ->> 'ownerId'` |
| `processed_events` | no | yes | the events the account produced |

`outbox` and `processed_events` are event plumbing, not data a person provided, so they are
erased but not exported. `processed_events` carries no account column at all: its rows are
selected through the outbox rows that produced them.

Migration `20260908120000_account_erasure` adds two things: a functional index on
`payload ->> 'ownerId'`, which keeps the two passes over the outbox off a growing event
history, and `erase_account(uuid)`, which performs the deletions. It is a database function
because PostgREST opens one transaction per request: the same statements sent from the
application would be three transactions, and a failure in between would leave an account
half erased with nothing recording how far it got. Calling it twice is a no-op by design, so
an interrupted erasure can be retried.

The migration is irreversible, which is the point of the feature. Its header says so instead
of offering a rollback that would not restore anything.

Credentials and sessions live in `auth.users` and are removed through the GoTrue admin
endpoint, not by deleting that row: deleting it directly would leave GoTrue's own session and
refresh-token tables behind, and revoking the sessions is the reason the step exists.

## Events

None published, none consumed. The erasure is the reason nothing is published: an event
announcing a deletion would carry the identifier of an account that is supposed to have
disappeared, and any consumer that recorded it would hold what the erasure removed.

Nothing has to be purged from the broker either. Event payloads carry identifiers and
nothing else (`docs/events/catalog.md`), and `packages/contracts/src/events.test.ts` asserts
the exact field list rather than trusting the rule.

## Errors

| Situation | Response | Note |
|---|---|---|
| No session, or an unusable one | `401 session_required` | Same as every other account route |
| `DELETE` with no confirmation field | `400 validation_error` | Rejected by the schema at the boundary |
| Confirmation is not the account's address | `422 erasure_not_confirmed` | The message names the rule, never the value submitted |
| Session valid, account absent from the store | `404 account_not_found` | The two stores have drifted; an empty export would say "you own nothing", which is false |
| Storage or provider failure | `500 internal_error` | Never a partial export: an empty document is indistinguishable from an account that owns nothing |

The security-relevant case is the export. It is scoped by the session's account and by
nothing else, and the port it reads through offers no way to ask for another account's rows.
A test asserts the property on the serialised document rather than field by field, because
the document is what a person receives.

## Accessibility

- The section is a labelled `section` inside the page's `main` landmark, with an `h2` that
  continues the existing heading hierarchy and an `h3` for the deletion form.
- The confirmation field reuses `AuthField`: a `label` tied to the input, help text and
  error both referenced by `aria-describedby`, and `aria-invalid` when refused.
- The refusal is a `role="alert"`, announced as soon as it appears. Export success is
  announced through the existing polite live region, which stays silent until something
  happens.
- The whole flow is reachable and operable by keyboard; there is no pointer-only control.
- `autocomplete` is off on the confirmation field. Letting the browser fill it would supply
  the proof of intent the field exists to obtain.
- Checked by `axe-core` over the full signed-in screen in
  `apps/web/src/components/personal-data-section.test.tsx`.

## Personal data

The email address is the only personal data the application collects. The export contains it,
along with item names, which are content the person typed.

- The export is never written to disk and never cached; the file exists only in the browser
  that asked for it.
- Its filename is fixed and impersonal, so a download does not carry an address into a
  shared folder.
- No response body echoes what was submitted, and the deletion answers `204` with no body:
  a confirmation listing what was removed would be a last copy of it.
- Nothing personal is logged. The error middleware logs a type, a status and a trace
  identifier, and the event payloads carry identifiers only.

## How to verify

Automated, on a fresh checkout:

```
npm run typecheck
npm test
npm run db:start && npm run db:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
```

The tests that cover it:

- `packages/core/auth/src/application/export-personal-data.test.ts`: the export spans every
  table, is dated, and carries no trace of another account.
- `packages/core/auth/src/application/erase-account.test.ts`: no row keeps the identifier,
  another account is untouched, sessions stop resolving, and a wrong confirmation erases
  nothing.
- `apps/api/src/http/routes/account.test.ts`: the same properties over real HTTP, including
  the cleared cookie and the replayed cookie that no longer works.
- `packages/infra/src/supabase-identity-provider.test.ts`: deletion against a stand-in
  GoTrue, including the already-deleted case a retry depends on.
- `scripts/check-schema.sql`, assertion 13: `erase_account` against a real database, with a
  bystander account that must survive and a second call that must be a no-op.

By hand, with the stack running: sign in, add an item, download the export and open it, then
delete the account with the wrong address (refused on the field), then with the right one.
The sign-in screen comes back without a reload, and signing in again fails.

## Known limits

- **Projects and memberships are absent.** The issue asks for them in the export, and asks
  the erasure to delete projects whose last member leaves while sparing shared ones. Neither
  table exists: US-16 (#17) introduces them and is still open, and it is owned by someone
  else. The export shape, the port and `erase_account` each cover one category per table, so
  adding them is an addition rather than a redesign, but until then those two acceptance
  criteria are not met.
- **Erasure and shared events.** `erase_account` removes the events an account produced and
  the processed-event rows they created. Today an item only ever notifies its owner, so the
  two sets coincide. Once a project is shared, an event of this account will have produced a
  notification for somebody else, and that notification would go with it. The migration says
  so at the statement concerned; deciding what should happen belongs to the story that
  introduces the sharing.
- **No audit trail.** Nothing records that an account was erased, on purpose: a record of
  the deletion would itself be a record of the person.
