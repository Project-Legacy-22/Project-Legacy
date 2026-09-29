# Product backlog

Project "TodoList to Kanban Application Rework".
Built from the requirements of the subject and the audit of the existing repository (`SP-00`).

This document is the reference for the scope and the prioritisation. It is kept up to date at each
Sprint Planning and at each review. Day-to-day progress tracking happens on the board:
<https://github.com/orgs/Project-Legacy-22/projects/1>.

Each item exists as an issue, attached as a sub-issue to its epic. The identifiers distinguish the
nature of the item: `US-` for a User Story, `EN-` for an enabler, `SP-` for a spike. The numbering
is unique across the whole backlog.

---

## 1. Working framework

### Item types

| Type | Definition | Estimate |
|---|---|---|
| **US** | Provides a service observable by a user | Story points |
| **Enabler** | Makes delivery possible or more reliable; no direct user benefit | Story points, counted separately |
| **Spike** | Research with an uncertain outcome: produces a decision, not code | Capped time, never points |

### Scale

Fibonacci 1, 2, 3, 5, 8. **An item estimated above 8 is split, without exception**: beyond that,
the estimate no longer means anything and the item does not fit in a sprint.

Conversion guide, to be recalibrated after sprint 1 with the real velocity: 1 point is worth about
half a day for one person, review and tests included.

### Capacity

Six people. The duration of the sprints is not fixed yet (decision D-02). Rule:
capacity = (working days of the sprint × 6) × 0.6, the 0.6 factor covering the ceremonies, the
cross reviews and learning the stack. The commitment is set at Sprint Planning from this capacity,
never from this document.

### MoSCoW

`Must` = the product is incomplete without it, in the sense of §6.1 of the subject.
`Should` = delivered if the core is under control. `Could` = if time allows.
`Would` = out of scope, owned, documented, not developed.

The MoSCoW priority **is not** the order of implementation: a `Should` assessed at the intermediate
review comes before a `Must` at the end of the journey.

### Definition of Ready

An item enters a sprint when: the story is clear, the acceptance criteria are testable, the
estimate is set by the team, the dependencies are **merged into `main`**, no blocking decision
remains open, and the GDPR and accessibility impacts are filled in, even to say there are none.

### Definition of Done

The eight points of §7 of the subject: PR approved, tests of the business logic, coverage
threshold, quality gate, complete CI green, artefacts produced, documentation up to date,
demonstrated at review.

### Progressive refinement

Sprint 1 is detailed down to the acceptance criteria (§4). Sprints 2 and 3 carry an intent and a
scope; their criteria are written at their Sprint Planning. Detailing sprint 3 today would produce
criteria that are out of date before being read.

---

## 2. Decisions to take on the first day

Eight decisions block sprint 1. A two-hour session, one recommendation per point so as to start from
a proposal rather than a blank page. Each decision taken becomes an ADR (SP-01).

| ID | Decision | Recommendation | Blocks |
|---|---|---|---|
| D-20 | Single user or shared projects | **Single user.** Sharing is a `Would have`: it blows up the data model, authorization and tests, for a point the subject does not require | EN-09, US-16, whole model |
| D-03 | Typing | **Strict TypeScript.** The subject explicitly assesses "the current level of typing" as a debt to correct | EN-04, EN-06 |
| D-04 | Backend split | **By domain, in layers inside each domain.** A purely horizontal split reproduces the current coupling | EN-04 |
| D-05 | Front-end toolchain | **Vite, React kept.** Keeping React limits the rewrite to the tooling; the subject does not ask to change library | EN-05 |
| D-06 | Data access | **Query builder or light ORM + versioned migrations, as files.** The graded point is schema versioning, not the tool | EN-09 |
| D-07 | Database | **PostgreSQL.** MySQL and SQLite are already present in the legacy without either being owned; PostgreSQL offers the types and constraints the model needs | EN-03, EN-09 |
| D-09 | Event mechanism | **In-process bus behind an interface, with an outbox table.** An external broker adds operations without bringing anything to the expected demonstration; the interface allows changing it later | US-10, US-18, EN-35 |
| D-19 | Session strategy | **Short access token + revocable refresh token, stored in an httpOnly cookie.** A JWT alone cannot be revoked, which contradicts US-27 and US-13 | US-11, US-27 |

Non-blocking decisions, to be taken before their sprint:

| ID | Decision | Deadline |
|---|---|---|
| D-01 | Composition of the team, PO, rotation of the Scrum Masters | before sprint 1 |
| D-02 | Dates of the sprints and of the two reviews | before sprint 1 |
| D-08 | Test framework and fate of the existing `spec/` folder | sprint 1 |
| D-10 | Quality gate tool | sprint 1 |
| D-11 | Final coverage threshold (proposal: 70 %) | sprint 1 |
| D-13 | Image registry (proposal: GHCR, already linked to the repository) | sprint 1 |
| D-15 | Target accessibility level (proposal: WCAG 2.1 AA) | sprint 1 |
| D-18 | Visual direction and component library | sprint 1 |
| D-21 | Language of the interface | sprint 1 |
| D-14 | Notification channel (proposal: in-app first) | sprint 2 |
| D-16 | GDPR data controller and contact | sprint 2 |
| D-17 | Data retention periods | sprint 2 |
| D-12 | Deployment target | sprint 2 |
| D-22 | Demonstration scenario and dataset | sprint 3 |

---

## 3. Overview

### Sprint 1 — Foundations, architecture and first vertical slice

Goal: at the intermediate review, demonstrate the seven assessed points. The scope of the sprint
**is** the intermediate assessment grid.

| ID | Type | Title | MoSCoW | Pts | Depends on |
|---|---|---|---|---|---|
| SP-00 | Spike | Audit of the legacy and inventory of the debt | Must | 1 d | — |
| SP-01 | Spike | ADRs of the stack and of the target architecture | Must | continuous | SP-00, §3 |
| EN-02 | Enabler | Git conventions, protection of `main`, templates | Must | 1 | — |
| EN-24 | Enabler | Board, backlog and agile traces kept up to date | Must | 2 | EN-02 |
| EN-03 | Enabler | Complete environment started with one command | Must | 3 | SP-00 |
| EN-30 | Enabler | Configuration through environment variables, zero versioned secret | Must | 2 | EN-03 |
| EN-04 | Enabler | Backend restructured in layers and typed, constant scope | Must | 8 | SP-01 |
| EN-05 | Enabler | Front-end build chain and accessibility foundation | Must | 5 | SP-01 |
| EN-09 | Enabler | Data model and versioned migrations | Must | 5 | EN-04, D-20 |
| EN-06 | Enabler | Tests and lint runnable locally | Must | 3 | EN-04 |
| EN-07 | Enabler | CI on every PR: lint, types, tests, build, coverage | Must | 5 | EN-06 |
| EN-17 | Enabler | Blocking quality gate on new code | Should | 3 | EN-07 |
| EN-08 | Enabler | Docker image published on every merge into `main` | Must | 3 | EN-03, EN-07 |
| US-10 | US | Event-driven workflow demonstrable end to end | Must | 8 | EN-04, EN-09 |
| US-11 | US | Create an account and sign in | Must | 8 | EN-09 |
| US-12 | US | Create and view my tasks | Must | 5 | US-11 |

**61 points, 40 of them enablers.** This imbalance is normal in sprint 1 and must be said at the
review: we are rebuilding the foundation of an existing application.

Start order imposed by the dependencies:
`EN-02 + SP-00` → `SP-01 + EN-03` → `EN-04 + EN-05` → `EN-09 + EN-06` → `EN-07` → `EN-17 + EN-08` → `US-10` → `US-11` → `US-12`.
The items of a same step are carried out in parallel by different people.

### Sprint 2 — Core features

| ID | Type | Title | MoSCoW | Pts | Depends on |
|---|---|---|---|---|---|
| US-31 | US | Edit, complete and delete a task | Must | 3 | US-12 |
| US-16 | US | Group my tasks by project | Must | 5 | US-12 |
| US-15 | US | Move a task between the columns of the Kanban | Must | 8 | US-12, US-16 |
| US-47 | US | Sign out | Must | 2 | US-11 |
| US-36 | US | Change my email and my password | Must | 3 | US-11 |
| US-37 | US | Privacy policy and consent | Must | 3 | US-11 |
| US-13 | US | Export and delete my personal data | Must | 5 | US-11, US-12, US-16 |
| US-27 | US | Persistent session and clean expiry | Should | 3 | US-11 |
| US-19 | US | Priority and due date on a task | Should | 3 | US-12 |
| US-18 | US | Be notified of the events that concern me | Should | 5 | US-10, US-11 |
| US-28 | US | Reset my forgotten password | Should | 5 | US-11, US-18 |
| US-14 | US | Accessibility compliance and remediation | Should | 5 | EN-05, US-15 |
| EN-48 | Enabler | Consistent loading, empty and error states | Should | 3 | EN-05 |
| EN-29 | Enabler | Security hardening of the API | Should | 3 | US-11 |
| EN-25 | Enabler | API integration tests, authorization included | Should | 5 | EN-07, US-12 |
| EN-38 | Enabler | Register of processing activities and minimisation | Should | 2 | EN-09 |

**63 points.** The `Must` items account for 29 of them: that is the floor of the sprint.

### Sprint 3 — Stabilisation, quality and demonstration

| ID | Type | Title | MoSCoW | Pts | Depends on |
|---|---|---|---|---|---|
| EN-44 | Enabler | Published API documentation | Must | 3 | US-12 |
| EN-45 | Enabler | Complete README and onboarding journey | Must | 2 | EN-03 |
| EN-46 | Enabler | Preparation of the final demonstration | Must | 3 | EN-43 |
| EN-42 | Enabler | Observability: health check and structured logs | Should | 3 | EN-04 |
| EN-40 | Enabler | Logs without superfluous personal data | Should | 2 | EN-42 |
| US-39 | US | Limited retention and automatic purge | Should | 3 | EN-38 |
| US-41 | US | Interface usable on a small screen | Should | 3 | EN-05 |
| US-20 | US | Personalised home screen | Should | 5 | US-12, US-16, US-19 |
| EN-43 | Enabler | Demonstration dataset | Should | 2 | US-15, US-16 |
| US-21 | US | Automatic closing of a finished project | Could | 3 | US-10, US-16 |
| US-32 | US | Search and filter my tasks | Could | 3 | US-16, US-19 |
| US-49 | US | Reorder a task within a column | Could | 3 | US-15 |
| EN-35 | Enabler | Event reliability: replay and dead-letter queue | Could | 5 | US-10 |
| EN-26 | Enabler | End-to-end tests of the critical journeys | Could | 5 | US-15 |
| EN-23 | Enabler | Contract tests between components | Could | 8 | US-10 |
| EN-22 | Enabler | Complete continuous deployment | Could | 8 | EN-08, D-12 |

**Commitment: the `Must` and `Should` items, that is 26 points.** The 35 points of `Could` are a
reserve, taken in the order of the table. A stabilisation sprint that commits to 60 points
stabilises nothing.

### Would have — out of scope, owned and documented

| ID | Subject | Reason for the exclusion |
|---|---|---|
| US-33 | Sharing a project between users | Follows from D-20: requires a role and authorization model that doubles the cost of every US |
| US-34 | Advanced roles and permissions | Same reason; not required by the subject |
| US-50 | Real-time collaboration | Requires a broadcast infrastructure unrelated to the assessed points |
| US-51 | Native mobile application | Outside the technical scope of the subject |
| US-52 | Third-party integrations | No value for the assessment |
| US-53 | Comments and attachments | Adds file storage and moderation for a marginal gain |
| US-54 | Customisable board columns | Complicates the Kanban model before it is stable |
| US-55 | Internationalisation | A single language is enough for the demonstration (D-21) |
| US-56 | Subtasks and Gantt chart | Outside the Kanban scope |
| US-57 | User analytics | Contradicts the stated GDPR minimisation |

---

## 4. Detail of the sprint 1 items

Only sprint 1 is detailed: its items must satisfy the Definition of Ready right now. Sprints 2 and 3
are refined at their planning.

### SP-00 — Audit of the legacy and inventory of the debt *(spike, 1 day)*

Produce a dated and prioritised list of the limits of the existing code, each one linked to the
backlog item that handles it. The audit serves as the argument for the ADRs and as the starting
point of the review.

Expected result: a versioned document listing, for each debt, the file concerned, the concrete
consequence and the item that corrects it. Rejected if it sticks to generalities.

Findings already established, to be confirmed and completed: no business layer between the HTTP
routes and persistence; the database driver selected as a side effect when the module loads;
schema created at startup without any migration or primary key; no input validation or error
handling at all; front end transpiled in the browser with frozen and unversioned libraries; a test
suite present but whose runner is not installed, hence not runnable; no container, no continuous
integration; no notion of a user in the model, which makes authentication and GDPR compliance
impossible without a redesign.

### SP-01 — ADRs of the stack and of the target architecture *(spike, continuous)*

One ADR per structuring decision, in the format chosen by the team: context, options actually
considered, decision, owned consequences, signal that would call the decision into question.

Minimum scope: the eight blocking decisions of §2. Each ADR is merged before the item it unblocks
starts.

### EN-02 — Git conventions, protection of `main`, templates *(enabler, 1)*

- The branch, commit and PR conventions are written and accessible to the whole team.
- `main` refuses direct pushes; a PR and an approval are required before merging.
- The PR and issue templates are in place and used by the first PR opened.
- The merge mode is unified for the whole repository.

### EN-24 — Board, backlog and agile traces kept up to date *(enabler, 2)*

- Each backlog item exists as an issue, carrying its priority, its estimate and its sprint.
- The board reflects the real state at any time of the day, not the day before the reviews.
- The roles and the rotation of the Scrum Master are written and up to date.
- The review and retrospective records are versioned at the end of each sprint, with actions
  assigned to named people.

### EN-03 — Complete environment started with one command *(enabler, 3)*

- A single command starts the API, the front end and the database from a freshly cloned
  repository, without a manual step.
- No absolute path or system directory is required: the legacy writes its database into a system
  directory, which prevents any local start.
- Development data survives a restart.
- The README describes the prerequisites, the command and the variables needed; it is checked by a
  person who did not write the item.

### EN-30 — Configuration through environment variables, zero versioned secret *(enabler, 2)*

- No secret, credential or connection string is present in the repository or in its history.
- Every expected variable is documented in a versioned example file, without a real value.
- The application refuses to start if a required variable is missing, with a message naming the
  variable.
- No read of the environment happens outside the configuration module.
- An automatic check detects the addition of a secret and blocks before publication.

### EN-04 — Backend restructured in layers and typed, constant scope *(enabler, 8)*

- The observable functional behaviour is identical before and after: same routes, same responses
  for the nominal cases.
- The business code is isolated from the HTTP transport and from persistence; it depends on no
  framework and no database driver.
- The dependencies between layers are checked automatically, not only at review.
- The persistence driver is provided when the application starts, no longer chosen when a module
  loads.
- Every input is validated at the boundary; an invalid input produces an explicit error response
  and not an unhandled exception.
- Business errors are typed and translated into HTTP responses at a single point.
- Logging is structured and contains no personal data.

### EN-05 — Front-end build chain and accessibility foundation *(enabler, 5)*

- The front end is compiled by a build tool: no more transpilation in the browser, no more library
  copied into the repository.
- The front-end dependencies are declared and locked.
- Development offers hot reloading; production produces an optimised bundle.
- The accessibility foundation is in place: semantic structure, visible focus, contrasts compliant
  with the chosen level, respect of the reduced motion preference.
- An automatic accessibility check runs with the tests.
- The accessibility defects inherited from the legacy are corrected on the screens taken over,
  notably the fields without a label and the help references pointing to non-existent elements.

### EN-09 — Data model and versioned migrations *(enabler, 5)*

- The schema is no longer created at startup: it results from versioned migrations, applied and
  checked in continuous integration.
- Each table has a primary key, the integrity constraints and the indexes needed; the inherited
  table had none.
- Every piece of data belonging to a user mandatorily carries its owner.
- Dates are stored in a temporal type, in universal time.
- A migration can be reversed or states in its header the reason why it is irreversible.
- Two migrations written in parallel by two people do not contradict each other.

### EN-06 — Tests and lint runnable locally *(enabler, 3)*

- A single command runs the tests, another the static analysis, a third the type check; all of
  them succeed on a freshly cloned repository.
- The test runner is declared as a dependency: the inherited suite is present but not runnable for
  lack of an installed runner.
- The fate of the inherited tests is decided and documented: kept, rewritten or deleted, with the
  reason.
- The tests rely on observable behaviour and not on the sequence of internal calls.
- Coverage is measured and published locally.

### EN-07 — CI on every PR: lint, types, tests, build, coverage *(enabler, 5)*

- Each PR triggers the static analysis, the type check, the tests, the build and the coverage
  report.
- A failure of any step prevents the merge.
- The result can be read from the PR without opening the logs.
- The dependencies are installed reproducibly and cached.
- The complete chain runs in less than ten minutes.
- No secret appears in the execution logs.

### EN-17 — Blocking quality gate on new code *(enabler, 3)*

- A quality analysis runs on each PR and publishes its verdict in the PR.
- The thresholds apply to the code added or modified, not to the whole repository: otherwise the
  inherited debt would block every contribution from the first day.
- Crossing a threshold prevents the merge, it does not merely warn.
- The chosen thresholds are written and justified.
- A demonstration PR proves that the blocking really works.

### EN-08 — Docker image published on every merge into `main` *(enabler, 3)*

- Each merge into `main` builds and publishes an image.
- The image carries an identifier traceable back to the commit that produced it.
- It starts without any configuration other than its documented environment variables.
- It contains neither secrets, nor useless sources, nor development dependencies.
- Publication only happens if continuous integration is green.
- The procedure to retrieve and run the image is documented.

### US-10 — Event-driven workflow demonstrable end to end *(US, 8)*

**As a** user, **I want** the creation of a task to automatically trigger a visible effect elsewhere
in the application, **so that** I do not have to produce that effect myself.

- Creating a task publishes an event described in a versioned catalogue.
- The event is recorded in the same transaction as the task: if recording the task fails, no event
  is published, and vice versa.
- A distinct component consumes the event and produces an effect observable by the user, not only
  a log line.
- Replaying the same event twice leaves the system in the same state.
- The payload carries no personal data: only identifiers and strictly necessary data.
- The name of the event carries a version; the catalogue documents the producer, the consumers and
  the expected effect.
- Three tests cover transactional publication, consumption and idempotency.
- The flow can be demonstrated in less than a minute in front of a jury.

*GDPR impact*: no personal data in the events, a structuring constraint for US-13 and EN-40.

### US-11 — Create an account and sign in *(US, 8)*

**As a** visitor, **I want** to create an account then sign in to it, **so that** I find my tasks
again from one session to the next.

- Account creation asks for an email address and a password, and nothing else.
- An address already in use does not allow creating a second account, without revealing to a third
  party that it already exists.
- The password is stored as a hash computed by an algorithm designed for this use; it never appears
  in clear text, neither in the database, nor in the logs, nor in a response.
- The password policy is applied on the server side and stated to the user before input.
- A failed sign-in attempt does not say which of the two pieces of information is wrong.
- Sign-in and account creation attempts are rate limited.
- After signing in, the user reaches their space; without a valid session, they are kept out of
  it.
- The forms can be used entirely with the keyboard, each field carries a label, and the errors are
  announced and attached to the field concerned.

*GDPR impact*: first collection of personal data; feeds the register of processing activities
(EN-38) and conditions US-13.

### US-12 — Create and view my tasks *(US, 5)*

**As a** signed-in user, **I want** to create a task and see the list of mine, **so that** I keep
track of what I have to do.

- A task is created with a title; an empty title or one made only of spaces is refused with an
  explicit message.
- The maximum length of the title is enforced on the server side, not only in the field.
- The list displayed contains only the tasks of the signed-in user. **A request on the task of
  another user returns the same response as for a task that does not exist**, so as not to
  disclose its existence. This criterion is blocking.
- An unauthenticated request is rejected.
- The list explicitly handles the absence of tasks, loading and a loading failure: the inherited
  code displays raw text while loading and ignores network errors.
- The list is paginated or bounded: the inherited version returns the whole table.
- Creation can be used with the keyboard and the action feedback is announced to assistive
  technologies.

*GDPR impact*: the content of the tasks is user data; it appears neither in the logs nor in the
events.

---

## 5. Coverage of the requirements of the subject

| Requirement of the subject | Items | Sprint |
|---|---|---|
| Secure authentication | US-11, US-27, US-28, EN-29, US-47 | 1-2 |
| GDPR-compliant user management | US-13, US-36, US-37, EN-38, US-39, EN-40 | 2-3 |
| CRUD of projects and tasks | US-12, US-31, US-16 | 1-2 |
| Kanban workflow | US-15, US-49 | 2-3 |
| Priorities and due dates | US-19 | 2 |
| Notifications | US-18 | 2 |
| Complete CI pipeline | EN-06, EN-07, EN-25 | 1-2 |
| Docker image publication | EN-08 | 1 |
| Demonstrable event-driven workflow | US-10, US-18, US-21, EN-23, EN-35 | 1-3 |
| Personalised home screen | US-20 | 3 |
| Blocking quality gate | EN-17 | 1 |
| Automatic closing of a project | US-21 | 3 |
| Continuous Delivery | EN-22 | 3 |
| Contract tests | EN-23 | 3 |
| Separation of responsibilities, API, testability | EN-04, EN-44 | 1-3 |
| Justified architecture decisions | SP-00, SP-01 | 1 |
| Agile traces: board, backlog, Git history | EN-02, EN-24, EN-46 | 1-3 |
| Accessibility *(added by the team)* | EN-05, US-14, US-41 + criteria of each front-end US | 1-3 |

### Grid of the intermediate review

| Assessed point | Covered by | Evidence shown |
|---|---|---|
| Architecture and technical foundations | SP-01, EN-04, EN-05, EN-09 | ADRs + walk through the code by layer |
| CI pipeline | EN-07 | a PR opened live, checks visible |
| Event-driven workflow | US-10 | creating a task, immediate visible effect |
| Quality and prioritisation of the backlog | this document, EN-24 | board and backlog online |
| Git conventions | EN-02 | history and closed PRs |
| Quality gate | EN-17 | a deliberately degraded PR, blocked |
| Demonstration of the workflow of a US | US-11 or US-12 | issue, branch, PR, review, CI, merge, board |
