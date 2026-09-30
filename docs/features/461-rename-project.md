# Rename a project

- **Issue**: #461, server side delivered by #462, screen by #463
- **Epic**: Projects
- **Decisions that apply**: ADR-0001, ADR-0003, ADR-0005

## What it does

The owner of a project gives it a new name. Its tasks, members and pending invitations are
untouched; only the name changes, and every place that names the project shows the new one.
Notifications already received read the project name when they are displayed, so they follow
the rename without being rewritten.

Members who do not own the project cannot rename it, and the screen does not offer them the
action.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `PATCH /projects/:projectId` | Renames a project the caller owns and returns it | session required |
| Projects section, Rename button of a row | Opens a form under the row, filled with the current name | session required, owner only |

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

## Screen

The new name replaces the old one in the project list, the Kanban heading and the members
panel at once, from the project the server sends back. The home screen is read again, since it
names projects as they were when it was loaded. Submitting the current name closes the form
without a request.

## Accessibility

- The Rename button is named after its project and exposes `aria-expanded`; it controls the
  form while it is open.
- The field has a visible label naming the project, and receives the focus when the form opens.
- A refusal, typed or from the server, is announced and linked to the field through
  `aria-describedby`, with `aria-invalid` set; the focus returns to the field.
- Escape or Cancel closes the form; closing, renamed or not, gives the focus back to the Rename
  button.
- While the request runs, the submit button is `aria-disabled` and not `disabled`: a disabled
  control drops out of the tab order and the focus would fall back to the top of the page (see
  #368). A second press is ignored.
- The success is announced by the section status region.
- `axe-core` checks the screen with the form open.

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
`apps/web/src/project-rename.test.tsx` covers the keyboard path, the focus, the refusals, the
home screen reload and the accessibility check.

## Known limits

- There is no concurrency check: two owners renaming at the same time keep the last name
  written, which is what a name is expected to do.
