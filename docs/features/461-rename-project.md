# Rename a project

- **Issue**: #461, server side delivered by #462
- **Epic**: Projects
- **Decisions that apply**: ADR-0001, ADR-0003, ADR-0005

## What it does

The owner of a project gives it a new name. Its tasks, members and pending invitations are
untouched; only the name changes, and every place that names the project shows the new one.
Notifications already received read the project name when they are displayed, so they follow
the rename without being rewritten.

Members who do not own the project cannot rename it. The screen that offers the action is
delivered by #463.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `PATCH /projects/:projectId` | Renames a project the caller owns and returns it | session required |

The body is governed by `RenameProjectBody` and the response by `ProjectDto`, both in
`packages/contracts`. The response is the project as its owner sees it: identifier, new name,
role and number of tasks.

## Data

No migration. The name is `projects.name`, whose length constraint and `updated_at` trigger
come from `20260908083028_add_projects_and_memberships`. The API reaches PostgREST with the
service role, so ownership is decided in the repository before the update, exactly as for a
deletion: the caller must hold an `owner` row in `project_memberships`.

## Events

None. A project name is content typed by a person and never enters an event.

## Errors

| Situation | Response | Note |
|---|---|---|
| Missing or invalid session | `401 session_required` | |
| Empty name, name over 255 characters, missing name, invalid identifier | `400 validation_error` | The project is unchanged |
| Project absent, caller outside it, or caller a member but not an owner | `404 project_not_found` | The three cases are indistinguishable, as for a deletion |
| Storage failure | `500 internal_error` | |

## Personal data

A project name may contain personal data since anyone can type anything into it. It is not
logged and does not enter any event.

## How to verify

```
npm test
npm run db:start
npm run test:integration
```

`packages/core/projects/src/application/projects.test.ts` covers the owner, a member, an
unknown project and invalid names. `apps/api/src/http/routes/projects.test.ts` covers the
route, its contract and its refusals. `apps/api/test/integration/projects.integration.test.ts`
renames through the real stack and checks that the tasks stay and that an outsider is refused.

## Known limits

- There is no concurrency check: two owners renaming at the same time keep the last name
  written, which is what a name is expected to do.
