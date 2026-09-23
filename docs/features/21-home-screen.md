# Home screen: what needs my attention

- **Issue**: #21 (backend: #376, interface: #377)
- **Epic**: Tasks
- **Delivered**: 2026-09-23
- **Decisions that apply**: ADR-0001, ADR-0003, ADR-0005

## What it does

A signed-in person can ask, in one request, which of their tasks need attention across every
project they are a member of: tasks that are overdue, tasks due today or tomorrow, and open
tasks of high priority. The server computes the groups; the browser never loads every task to
sort them itself.

After signing in, the first section of the page lists those groups, before the project list.
Choosing a task opens it in its project.

The groups do not overlap. A task appears once, in the most urgent group it qualifies for:
overdue first, then due today or tomorrow, then high priority. A done task never appears.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `GET /projects/attention?today=YYYY-MM-DD` | The three groups and the account's workload | session required |
| "Needs your attention" section | First section of the signed-in page | session required |

`AttentionQuery` and `AttentionDto` in `packages/contracts` govern the request and response.
Each group carries at most 20 tasks and a `hasMore` flag. Each task is an `ItemDto` plus the
`projectName` of the project it belongs to. `workload` is `none` when the account has no task
at all, `all_done` when every task is done, and `open` otherwise, so an interface can tell
"nothing yet" from "everything done" from "nothing urgent".

`today` is required. A due date is a calendar day interpreted in the browser's time zone
(#20), so the day the groups are computed against has to be the caller's, not the server's.

The route is under `/projects` because it reads across them, and because that prefix is
already routed to the API by `vercel.json` and the development proxy.

## Data

Reads `items`, joined to `projects` for the name and to `project_memberships` for the scope.
No table, column or index is added. Scope is membership, not authorship: a member of a shared
project sees the tasks another member created there.

The rule that sorts a task into a group lives in `packages/core/items/src/domain/attention.ts`.
The Supabase adapter (`supabase-attention-reader.ts`) translates it into filters, and the
integration suite checks the two agree.

## Errors

| Situation | Response | Note |
|---|---|---|
| No session | `401` | Mounted behind the session guard like every item route |
| `today` missing or not a calendar day | `400 validation_error` | Rejected before the use case |
| Storage failure | `500 internal_error` | The response contains no task data |

There is no project identifier in the request, so there is nothing to report as absent: a
project the caller does not belong to simply contributes nothing.

## Screen

The section is the first region of the main landmark, so it precedes the project list in
reading and tab order. Each group lists its tasks with the project they live in, their due date
and their priority, and says so when it is empty. When every group is empty, one message says
which of three situations applies, with an action: no task yet or everything done lead to the
task form, open work of which nothing is urgent leads to the task list.

The browser sends its own calendar day, read in its time zone, like the `Overdue` badge of a
task card. The section is asked again after any task is added, changed, moved or removed in
the same tab, so a task completed below leaves the list above.

Choosing a task selects its project, clears the list filters that could hide it, and moves
focus to the task's Move button once the list holds it. When the task is not on the first page
of its project, focus goes to the list heading instead.

## Accessibility

- Each task is a native button: Enter and Space open it, and its accessible name is its text,
  so a screen reader hears the task, its project, its due date and its priority.
- One `h2` for the section and one `h3` per group keep the heading hierarchy continuous.
- The section carries `aria-busy` while loading, and its loading, empty and error states come
  from the shared `ViewState` (#49): a polite status, an action on every empty message, an
  alert with a retry on failure.
- Opening a task moves focus into the task list rather than leaving it on a row that is no
  longer where the person is working.
- `axe-core` covers the section with filled groups.

## Personal data

Task names, dates, priorities and project names are the caller's own data or that of projects
they were added to. They are returned to the caller only, and are not written to logs or
events. The `today` query parameter is not personal data. The browser keeps the answer in
memory only: nothing is written to local storage.

## How to verify

```
npm run test:unit -- packages/core/items
npm run test:http -- apps/api/src/http/routes/attention.test.ts
npm run test:integration -- apps/api/test/integration/attention.integration.test.ts
npm run test:dom -- apps/web/src/home-screen.test.tsx
```

The integration suite proves on the real database that two accounts see none of each other's
tasks, and that a member of a shared project sees its tasks with the project's name.

## Known limits

- A group lists its first 20 tasks. The rest is read in the project screen.
- A task beyond the first page of its project is opened with focus on the list heading, not on
  the task itself.
- A project beyond the first page of the project list cannot be opened from a row until that
  page is loaded: the row selects it, but the list shows it only once it is loaded.
