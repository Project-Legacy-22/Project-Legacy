# Final demonstration

The running order of the final review, step by step: what we show, what each step must prove, who
presents it and how long it takes (#47). It covers each point of the assessment grid of the subject
(§9) and says, for each one, which step answers it.

**Target duration: 20 minutes**, questions not included. The subject does not set the duration of
the review: it is an assumption to confirm with the supervisors, and the timing tightens if it is
shorter (steps 7 and 9 then merge into the others).

## Preparation

The day before:

- [ ] `npm ci && npm run up` on the presenting machine; then `npm run db:reset`, which reloads the
      demonstration dataset with due dates computed from the same day (one overdue task, one for
      today).
- [ ] Production responds: <https://project-legacy-web-legacy-9eee.vercel.app>, sign-in with a
      team account.
- [ ] The last `ci` run on `dev` is green, the last release published its image and its release,
      the `relais` workflow is green.
- [ ] The Grafana dashboard "Legacy 22 — flux et service" displays measurements from the last
      hours.
- [ ] A demonstration pull request is open and **not approved**, for step 6.
- [ ] The review and retrospective records of each sprint are written in
      `docs/reviews/sprint-N.md` and `docs/retros/sprint-N.md`, assigned actions included. As of
      24 September 2026, none is in the repository: step 8 has nothing to show while they are
      missing, and only the team can write them.

On the day, in this order, three terminals and a browser:

```bash
# terminal 1: broker and database
docker compose up -d && npm run db:start
# terminal 2: API and front end
npm run dev:api & npm run dev:web
# terminal 3: the worker alone, so that it can be stopped at step 3
npm run dev:worker
```

Tabs opened in advance: the local application (<http://localhost:5173>), production, the repository
(pull requests, Actions tab), the board of the Project, SonarCloud, the Pages site (coverage and API
documentation), Grafana.

Accounts of the demonstration dataset, which only exist on the local stack:
`camille.demo@example.com` and `hugo.demo@example.com`, password `DemoLegacy2026`.

## The running order

| # | Duration | Step | What we show | What it proves |
|---|---|---|---|---|
| 1 | 1 min | Where we start from | `docs/audit-legacy.md`: the application taken over, its measured debt, point by point | the existing system was understood before being changed |
| 2 | 4 min | The product, by priority | sign-in as Camille; home screen (overdue task, task of the day, high priority); opening a task from the home screen; creating a task with a priority and a due date; moving it in the Kanban **with the keyboard**; reordering within a column; members of a project | the Must then the Should delivered, and accessibility held |
| 3 | 3 min | The event flow end to end | `Ctrl+C` in terminal 3; creating a task; `docker compose exec redis redis-cli LLEN legacy22:events` goes up; restarting `npm run dev:worker`; the queue drains and the notification appears in the interface; `docs/events/catalog.md` | the transactional outbox, the broker, idempotent consumption; an event is never lost when the consumer goes down |
| 4 | 2 min | GDPR | JSON export of the account; deletion of Hugo's account after confirmation by the address; `docs/gdpr/registre.md` | portability, real erasure, register maintained |
| 5 | 3 min | Quality and tests | the `ci` jobs on a pull request; the SonarCloud quality gate; the coverage report on Pages; the generated API documentation; `docs/testing-levels.md` | a real test pyramid, a measured coverage, an API described without reading the code |
| 6 | 2 min | What blocks a pull request | the unapproved PR: merge button blocked (an approval and SonarCloud required on `dev`); an approval dismissed by a new push; `git push origin HEAD:dev` refused by the `pre-push` hook; the `guard-branches` workflow; `tk verify` and its sixteen checks | the process is not declarative: a workaround is refused or traced |
| 7 | 2 min | Release | `tk release`: the PR from `dev` to `main`, the merge commit; the GHCR image tagged `sha-<short>` with its attestation; the release; the Vercel deployment; the `migrations` workflow | complete CI/CD, artefacts traceable back to the commit |
| 8 | 2 min | Agile organisation | the board and its views (current sprint, blocked, out of scope); MoSCoW and milestones; the Would documented and not developed; the records `docs/reviews/` and `docs/retros/` | Scrum practised, prioritisation owned, traces left |
| 9 | 1 min | Architecture and decisions | `docs/architecture.md` (layers, flow of a request); the ADR index; the Grafana dashboard | explicit, justifiable choices, and an observable system |

Total: 20 minutes.

## Mapping to the assessment grid

| Point of the grid (subject §9) | Steps |
|---|---|
| Functional coverage according to the priorities | 2, 3, 4 |
| Code quality and test coverage | 5, 9 |
| CI/CD | 5, 6, 7 |
| Git history and pull request practice | 6, 7 |
| Agile organisation and team retrospective | 8 |
| Overall quality and maintainability | 1, 5, 9 |
| Reminder of the intermediate review: architecture, event flow, backlog, Git conventions, quality gate, journey of a US | 9, 3, 8, 6, 5, 2 and 7 |

## Fallback plan

Each dependency that does not belong to us has its alternative, prepared the day before.

| If this is missing | We show instead |
|---|---|
| Vercel or production | the local stack, which carries the whole journey; the last deployment in the Vercel history |
| The hosted Supabase project | the local stack (`npm run db:start`), which is a complete Supabase |
| Upstash | the local Redis of `compose.yaml`, which is the one of step 3 anyway |
| GitHub | `git log --graph` locally; the PR and Actions pages saved the day before as PDF |
| SonarCloud or Grafana | a screenshot from the day before, dated; the local coverage report (`coverage/index.html`) |
| The whole network | the local stack alone; the screenshots and PDFs from the day before for the rest |

The local stack only depends on Docker: it is the fallback foundation of every other line.

## Who presents what

Proposal based on what each person carried, according to the sprint reviews: two presentations per
member, **to be validated in a team meeting**. The final distribution is recorded here, by name,
before the rehearsal.

| Step | Presents | Answers questions on |
|---|---|---|
| 1 | Arthur Dos Santos | the audit of the existing system, the foundation |
| 2, sign-in and session | Arthur Gasmi | accounts, persistent session and expiry |
| 2, home and search | Victor Briez | home screen, search and filters |
| 2, Kanban and members | Arthur Guyetand | tasks, Kanban, reordering, members |
| 3 | Seïf Soltane | event flow, idempotency |
| 4 | Arthur Gasmi | export and deletion of the data, GDPR |
| 5 | Aurélien Pochart | tests, accessibility |
| 6 | Aurélien Pochart | quality gate, protections of a pull request |
| 7 | Arthur Dos Santos | continuous integration, release |
| 8 | Victor Briez and Arthur Guyetand | backlog and prioritisation; board and retrospective |
| 9 | Seïf Soltane | architecture, ADRs, data hosting |

## Rehearsal

- [ ] Rehearsed from start to finish, stopwatch in hand: date, measured duration, what overran.
- [ ] The fallback plan tried at least for the line "the whole network".

As long as these two boxes are not ticked and dated, the demonstration is not ready.
