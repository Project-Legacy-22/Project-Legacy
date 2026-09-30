# What the subject expects, and what we delivered

Every expectation of the subject "TodoList to Kanban Application Rework", with its priority, whether
we delivered it, and where to see it. State on 30 September 2026.

**Summary: 7 of 7 Must and 4 of 4 Should delivered, 1 of 3 Could delivered.** The two Could
items not delivered are documented as future work, as section 6.4 of the subject asks.

## Features, by MoSCoW priority (section 6)

| Priority | Expectation | Delivered | Where to see it |
|---|---|---|---|
| Must | Secure authentication | Yes | Sign-up, sign-in, session renewal and expiry, sign-out, password reset, credential change, rate limits: [28](features/28-session-lifetime.md), [29](features/29-password-reset.md), [30](features/30-api-hardening.md), [37](features/37-account-credentials.md), [48](features/48-logout.md) |
| Must | GDPR-compatible user management | Yes | Consent, export, deletion, retention purge, register, logs without personal data: [14](features/14-export-and-delete-account.md), [38](features/38-privacy-policy-consent.md), [41](features/41-logs-without-personal-data.md), [register](gdpr/registre.md) |
| Must | Project and task CRUD operations | Yes | Projects created, listed, renamed and deleted; tasks created, read, edited and deleted: [17](features/17-projects.md), [32](features/32-edit-complete-delete-task.md), [461](features/461-rename-project.md) |
| Must | A basic Kanban workflow | Yes | Moving between columns, with a keyboard alternative, and reordering within a column: [16](features/16-kanban-move.md), [50](features/50-reorder-task.md) |
| Must | A complete CI pipeline | Yes | Lint, types, layer rules, tests, coverage, build, image, migrations, dependency audit, CodeQL, on every pull request: [ci.md](ci.md) |
| Must | Docker image publication | Yes | `ghcr.io/project-legacy-22/project-legacy`, published with a release on every delivery to `main`: [ci.md](ci.md) |
| Must | At least one demonstrable event-driven workflow | Yes | Task created, event written in the same transaction, relayed through Redis, consumed into a notification: [catalog](events/catalog.md), [127](features/127-event-consumer-and-notifications.md) |
| Should | Notifications | Yes | Task created, member added, invitation to accept or decline: [19](features/19-notifications.md) |
| Should | Task priorities and deadlines | Yes | [20](features/20-priority-due-date.md) |
| Should | A personalised home screen | Yes | Overdue, due soon and priority tasks across the projects: [21](features/21-home-screen.md) |
| Should | A blocking code-quality gate | Yes | SonarCloud on new code, a failing gate blocks the merge: [ADR-0009](adr/0009-sonarcloud-comme-outil-de-quality-gate.md), [ci.md](ci.md) |
| Could | Automatic project closure | No | Future work, US-21: [backlog, section 6](backlog.md#6-state-at-the-end-of-the-project) |
| Could | A complete Continuous Delivery process | Yes | Every merge to `main` deploys to production on Vercel; previews on `dev` and on every pull request: [ci.md](ci.md) |
| Could | Contract testing between components | No | Future work, EN-23: [backlog, section 6](backlog.md#6-state-at-the-end-of-the-project) |

## Other expectations of the subject

| Section | Expectation | Delivered | Where to see it |
|---|---|---|---|
| 2 | Understand the existing system and its technical debt | Yes | [Audit of the legacy](audit-legacy.md) |
| 3 | A functional user interface | Yes | Four signed-in views and a navigation: [446](features/446-signed-in-views.md); production URL in the [README](../README.md) |
| 3, 4 | Architectural and technical choices justified | Yes | 22 decision records: [adr/](adr/README.md) |
| 4 | Separation of responsibilities, testability, maintainability | Yes | Layers per domain, checked in CI: [architecture.md](architecture.md), [testing-levels.md](testing-levels.md) |
| 4 | API design | Yes | Generated and published OpenAPI description: [openapi.json](api/openapi.json) |
| 4 | Asynchronous communication and data ownership | Yes | Outbox and broker; row-level security per project member: [architecture.md](architecture.md) |
| 4 | Architecture operational end to end early | Yes | Layers, CI, quality gate and the event publication shown at the intermediate review: [intermediate review](reviews/soutenance-intermediaire.md) |
| 5.1 | A Product Owner and a rotating Scrum Master | Yes | [team.md](team.md) |
| 5.2 | Daily stand-ups, Sprint Planning, Sprint Reviews, Retrospectives | Yes | [dailies/](dailies/), [plannings/](plannings/), [reviews/](reviews/), [retros/](retros/) |
| 5 | A maintained, prioritised product backlog | Yes | [backlog.md](backlog.md), [priorisation.md](priorisation.md), and the [board](https://github.com/orgs/Project-Legacy-22/projects/1) |
| 6.4 | Out-of-scope features documented as future work | Yes | [backlog, sections 3 and 6](backlog.md#6-state-at-the-end-of-the-project) |
| 7 | Every story reviewed through a pull request with an approval | Yes | Every merged pull request carries an approval |
| 7 | Unit tests and the required coverage | Yes | Thresholds enforced in CI: 70 % of lines, statements and functions, 60 % of branches |
| 7 | Build artifacts and documentation kept up to date | Yes | Image and release per delivery; one page per delivered feature: [features/](features/README.md) |
| 8.3 | Deployment and final demonstration prepared | Yes | [demo.md](demo.md), production URL in the [README](../README.md) |
| Added | Accessibility, WCAG 2.1 AA | Yes | [15](features/15-accessibility-audit.md), [436](features/436-rgaa-audit.md) |
