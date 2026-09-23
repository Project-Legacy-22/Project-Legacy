# Remove a project member

- **Issue**: #354, part of US-33 (#34)
- **Epic**: Projects
- **Decisions that apply**: ADR-0001, ADR-0003, ADR-0005, ADR-0008

## What it does

A project owner can remove a membership without deleting the account or any task.
The removed person keeps their session and access to their other projects, but new
requests can no longer read or write the project they left. Tasks they created remain
in that project with the same creator, content, status, priority and due date.

Only owners can remove members, including themselves. An owner can leave when another
owner remains; removing the last owner is refused. This issue implements the server
operation. The members screen and its accessible confirmation belong to #351.

## Surface

`DELETE /projects/:projectId/members/:userId` requires a session. Both path identifiers
are validated by `ProjectMemberIdParams` in `packages/contracts`. The caller comes from
the session, never from request data. Success is `204` with no body. Retrying a completed
removal returns `404` and does not affect another membership.

Errors use the existing `ProblemDetails` contract:

| Situation | Status and type |
|---|---|
| Missing or invalid session | `401 session_required` |
| Invalid path identifier | `400 validation_error` |
| Project absent or caller outside it | `404 project_not_found` |
| Caller is a member but not an owner | `403 project_owner_required` |
| Target membership absent, for an authorized owner | `404 project_member_not_found` |
| Target is the last owner | `409 last_project_owner` |
| Database failure | `500 internal_error` |

The non-member and absent-project responses are indistinguishable for the same
requested identifier. An existing member gets `403` because they already know the
project exists. A non-owner cannot use the endpoint to leave voluntarily either.

## Data and concurrent requests

Migration `20260918074845_remove_project_member` adds an internal PostgreSQL function.
It deletes only the target row of `project_memberships`; it never deletes from `users`
or `items`, and does not alter the policies granting project members access to tasks.

The use case checks the caller, target and remaining owners. The database repeats those
checks while holding the project row lock, in the same transaction as the deletion.
This second check is necessary: the first read can become stale while another request
removes the caller or another owner. Competing removals of the same project serialize;
under the normal READ COMMITTED isolation level, the waiting operation sees the first
transaction's committed result and returns the corresponding refusal.

The RPC uses `SECURITY INVOKER`, an empty search path and schema-qualified relations.
Only `service_role` may execute it. Browser roles cannot supply a forged caller to it,
and cannot delete memberships directly. No new public-table grants are introduced.

The schema addition can be undone by dropping the function. A schema rollback does not
restore memberships already removed. They must be re-added explicitly.

## Personal data

This is not account erasure: it retains the account, task authorship and tasks. Existing
account-erasure and retention rules remain unchanged. No new personal data is collected,
no event is emitted, and addresses or task content are not added to logs or errors.

## How to verify

Run from a checkout with the locked dependencies installed:

```sh
npm run test:unit -- packages/core/projects
npm run test:http -- remove-project-member.test.ts
npm run typecheck
npm run lint
npm test
npm run build
```

Use a disposable local Supabase stack with all migrations applied for database tests.
Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to that stack,
and `REDIS_URL` to a separate test Redis if running the entire integration suite.
Never reset an existing development or hosted database just to run these checks.

```sh
npm run test:integration -- remove-project-member.integration.test.ts member-removal-concurrency.integration.test.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
```

The schema check includes `check-project-member-removal.sql`. Its fixtures and injected
post-deletion failure trigger are wrapped in a rolled-back transaction. It verifies
refusals, task preservation, rollback after a forced failure and RPC privileges.

The integration tests exercise real HTTP sessions and RLS with a still-valid token after
removal. The concurrency tests hold one transaction open, observe the second request
waiting on its database lock, then commit. They verify both simultaneous owner departures
and removal of a caller whose authorization was valid before they waited. They require
Docker and identify the tested stack by its API port, not the first running database.

Manual API check with disposable accounts:

1. Sign in as an owner and another account. Prepare the second account's membership in
   a throwaway project using test fixtures or local Studio until #353 supplies addition.
2. Create a task as that member and retain its identifier.
3. As the owner, delete that membership. Check the empty `204` and updated member list.
4. With the member's unchanged session, try reading and editing that project's tasks:
   both are refused. Their own other projects and session still work.
5. As the owner, verify the task remains unchanged. Try removing the sole remaining
   owner: `409`, and the project remains accessible.

## Coordination and limits

- #351 implements the removal control, confirmation, keyboard path and announced result.
  There is no new browser control in #354.
- #353 implements adding members. No invitation or role-management endpoint is added here.
- #348 (US-58) introduces task assignment. No assignment column exists in this schema,
  and `items.user_id` is the creator, not an assignee. When #348 adds assignment, it must
  extend `remove_project_member` to clear only this project's matching assignments in
  the same transaction. Assignment writes must coordinate with the same project lock
  and recheck membership after acquiring it. Add tests for assignment versus removal
  and for an injected failure after assignments are cleared. Update the shared SQL
  function registry so concurrent migration changes cannot silently replace each other.
