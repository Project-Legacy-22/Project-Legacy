# Projects and project-scoped items

- **Issue**: #17
- **Epic**: Projects
- **Delivered**: 2026-09-08
- **Decisions that apply**: ADR-0001, ADR-0006, ADR-0007, ADR-0008

## What it does

A signed-in person organises items into projects. Every new account starts with a default
project, existing items are migrated into one project per account, and a member can select a
project to work on its shared item list. Creating invitations and changing memberships are
deliberately left to US-33 (#34); this issue establishes the model those features will use.

Only an owner can remove a project. The interface names the project and the exact number of
stored items before asking for confirmation, then the database removes the project and all of
its items together.

## Surface

| Endpoint or screen                      | Purpose                                          | Auth             |
| --------------------------------------- | ------------------------------------------------ | ---------------- |
| `GET /projects`                         | Lists one page of projects visible to the caller | session required |
| `POST /projects`                        | Creates a project and its owner membership       | session required |
| `DELETE /projects/:projectId`           | Removes an owned project and its items           | session required |
| `GET /projects/:projectId/items`        | Lists one page of items in a member project      | session required |
| `POST /projects/:projectId/items`       | Creates an item in a member project              | session required |
| `PUT /projects/:projectId/items/:id`    | Replaces an item in a member project             | session required |
| `DELETE /projects/:projectId/items/:id` | Removes an item from a member project            | session required |
| Projects section                        | Creates, selects, paginates and removes projects | session required |

The request and response shapes are governed by `ProjectIdParams`, `ProjectItemIdParams`,
`CreateProjectBody`, `ListProjectsQuery`, `ProjectDto`, `ProjectPageDto` and the existing item
contracts in `packages/contracts`.

Both collections use keyset pagination. `limit` defaults to 20 and is bounded at 100;
`nextCursor` is `null` on the final page. A cursor is opaque to the browser.

## Data

Migration `20260908083028_add_projects_and_memberships` creates `projects` and
`project_memberships`. A membership has a composite primary key `(project_id, user_id)` and
a role constrained to `owner` or `member`. Its inverse `(user_id, project_id)` index serves
member project lists and policy checks.

Every `items.project_id` is mandatory, indexed for the item pagination order and references
`projects.id` with `ON DELETE CASCADE`. The migration creates one default project for each
existing account, attaches its items, and extends the authentication mirror trigger so a new
account and its default project are created in the same transaction.

Project creation calls `create_project_for_owner`, which inserts the project and owner
membership atomically. The API currently reaches PostgREST with the service role and repeats
membership checks in its repositories. RLS is the second line of defence for direct
authenticated access: projects are visible to members, items are readable and writable by
members, and projects are deletable only by owners.

Migration `20260908144244_extend_account_erasure_for_projects` completes US-13. Account
erasure removes the caller's memberships, deletes projects where that caller is the last
member, and preserves projects that still have another member. The internal erasure function
is executable only by the service role.

## Events

Creating an item still writes `item.created.v1` and the item in one transaction. Its strict
payload remains `{ itemId, ownerId }`: a project name and item name are content entered by a
person and never enter an event. Creating or deleting a project publishes no event in this
issue.

## Errors

| Situation                                            | Response                                        | Note                                                    |
| ---------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Missing or invalid session                           | `401 session_required`                          | Applied before every project and item route             |
| Invalid name, limit, cursor or identifier            | `400 validation_error` or a typed cursor error  | Rejected at the boundary or by the domain               |
| Project absent or caller not a member                | `404 project_not_found`                         | The response does not reveal whether the project exists |
| Item absent from that project or caller not a member | `404 item_not_found` or `404 project_not_found` | No `403` existence oracle                               |
| Project deletion by a non-owner                      | `404 project_not_found`                         | Same response as an unknown project                     |
| Storage failure                                      | `500 internal_error`                            | No database detail or submitted value is returned       |

## Accessibility

- Project creation has a programmatic label, linked help and error text, keyboard submission,
  visible focus and an announced refusal next to the field.
- Selection uses native buttons with `aria-pressed`; no pointer-only interaction is required.
- Project and item pagination preserve the current content and announce loaded rows.
- Project deletion uses a native confirmation that names the project and item count. Focus
  moves to the next project, the previous project, or the creation field after deletion.
- Loading, empty and failure states are explicit. Failures can be retried without reloading.
- `axe-core` checks the complete signed-in screen against WCAG A and AA rules supported by
  jsdom.

## Personal data

Project names and item names are content entered by a person. They never enter application
logs, browser persistence or event payloads. The portability export now includes all projects
visible through the caller's own memberships, the caller's membership rows and each exported
item's project identifier. It never includes another member's account identifier.

Deleting an account removes its membership rows. A project and its items are physically
deleted only when no other member remains; shared projects and the remaining members' items
survive.

## How to verify

On a fresh checkout:

```text
npm ci
npm run typecheck
npm test
npm run db:start
npm run db:reset
npm run test:integration
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
npm run build
```

The core suites cover project name rules, member-scoped pagination, creation, deletion and
member/non-member item access. HTTP suites cover every new route and indistinguishable 404
responses. The integration and schema suites exercise the real Supabase adapter, RLS,
default-project trigger, delete cascade and account-erasure behaviour.

By hand: create an account and observe its default project, create a second project, add and
paginate items, switch between projects, then remove one. Cancel the first confirmation and
verify nothing changes; confirm again and verify the named project and its item rows disappear.

## Known limits

- Membership invitations and role changes are not exposed yet. US-33 (#34) owns that work.
- Project renaming and archiving are outside this issue.
