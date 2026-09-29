# Audit of the legacy

Starting point: `docker/getting-started-app`, commit `42752ef`, about 250 useful lines.

This document answers §2 of the subject, which asks to understand the existing system before
deciding how to make it evolve, and which names six areas of attention. Each debt carries an
identifier, the file concerned, its observable consequence, and the backlog item that corrects it.
A debt without a concrete consequence is not one: this document only lists what produced a
measurable effect.

It serves as the argument for the ADRs (`SP-01`) and as the justification for the backlog
estimates, and **replaces the debt table of the architecture standard**, which only gave an
extract of it.

The identifiers are prefixed `DET-`: the `D-` series already designates the decisions to be taken
in the backlog, and two series with the same name in the same discussions would end up being
confused.

---

## 1. Structure of the application

Three directories, no layer. `src/index.js` mounts Express, wires four routes and calls
`db.init()`. `src/routes/` contains one file per HTTP verb. `src/persistence/` exposes two drivers
behind an `index.js` that picks one. `src/static/` serves the front end.

There is no business layer: between the HTTP request and the database, nothing.

| Debt | Finding | Consequence | Corrected by |
|---|---|---|---|
| **DET-01** | The handlers call persistence directly (`src/routes/*.js`) | No business rule can be tested without HTTP or a database | `EN-04` |
| **DET-02** | The driver is chosen as a side effect when the module loads: `if (process.env.MYSQL_HOST) module.exports = require('./mysql')` | Impossible to inject a double; the choice is global and frozen at the first `require` | `EN-04` |

## 2. Organisation of the front end and the back end

The front end is served statically by the API from `src/static/`. It transpiles **in the
browser**: `index.html` loads `babel.min.js`, then `app.js` as `type="text/babel"`. React, ReactDOM,
React-Bootstrap and Font Awesome are files copied into the repository.

| Debt | Finding | Consequence | Corrected by |
|---|---|---|---|
| **DET-03** | In-browser transpilation, vendored libraries (`src/static/js/*.min.js`) | No build, no bundling, no versioned or updatable dependency | `EN-05` |
| **DET-04** | `app.js` mixes rendering, network calls and state in a single file | A component cannot be tested without the network | `EN-05` |
| **DET-05** | ``className={`item ${item.completed && 'completed'}`}`` produces the class `item false` when the task is not completed | Stray class in the delivered DOM | `EN-05` |
| **DET-06** | `aria-describedby="basic-addon1"` points to a non-existent element; the field has no `label` | A screen reader announces a dead reference and a field without a name | `EN-05`, `US-14` |
| **DET-07** | The `fetch` calls never check `response.ok` | A server error is handled as a success: the interface displays a false state | `EN-05`, `EN-48` |

## 3. Distribution of responsibilities

The routes carry validation, identifier generation, persistence and the response format — that is
everything. Persistence carries the creation of the schema. Nobody carries the business rules,
since there is none that is explicit.

| Debt | Finding | Consequence | Corrected by |
|---|---|---|---|
| **DET-08** | No input validation: `POST /items` accepts `{}` and stores `name: undefined` | An invalid row enters the database without any layer opposing it | `EN-04` |
| **DET-09** | No `try/catch`, no error middleware | Express 5, locked at 5.2.1, passes the rejection to the default handler: outside production the client receives a `500` together with a **stack trace**, which exposes the server file tree | `EN-04` |
| **DET-10** | `updateItem` runs an `UPDATE` then a `SELECT` without checking existence | On an unknown identifier: `200` with an empty body, instead of `404` | `EN-04` |
| **DET-11** | `deleteItem` answers `res.sendStatus(200)` without looking at whether the row existed | Impossible to distinguish an actual deletion from a resource already absent | `EN-04` |
| **DET-12** | `getItems` returns `SELECT * FROM todo_items` without a limit | The response grows with the table, without pagination or bound | `US-12` |

## 4. Test strategy

Five files in `spec/`, written for Jest. **Jest is not among the dependencies** and `package.json`
declares no `test` script: the suite cannot run.

Read closely, it checks sequences of internal calls rather than behaviours.

| Debt | Finding | Consequence | Corrected by |
|---|---|---|---|
| **DET-13** | `devDependencies` only contains `nodemon`; no `test` script | The inherited suite is dead: it protects nothing | `EN-06` |
| **DET-14** | `expect(db.storeItem.mock.calls[0][0]).toEqual(...)` (`spec/routes/addItem.spec.js`) | Any internal rename breaks the test while the behaviour is intact | `EN-06` |
| **DET-15** | `jest.mock('../../src/persistence')` mocks a module by its path | The test depends on the file tree, not on the contract | `EN-06` |

## 5. Typing and code quality

No typing: JavaScript without annotations, without JSDoc, without `tsconfig.json`. No linter, no
formatter, no complexity rule. The subject explicitly names "the current level of typing" among the
points to examine.

| Debt | Finding | Consequence | Corrected by |
|---|---|---|---|
| **DET-16** | No typing or static analysis | A typo in a field name is only discovered at runtime | `EN-04`, `EN-06` |
| **DET-17** | `fs.readFileSync(HOST_FILE)` returns a `Buffer`, passed as is to `waitPort` and `mysql.createPool` | The `*_FILE` variants, intended for secrets, pass an unexpected type | `EN-04`, `EN-09` |
| **DET-18** | `console.log` for all logging, including the database path | No usable structure, and infrastructure information in clear text | `EN-04`, `EN-42` |
| **DET-19** | `"main": "index.js"` while the entry point is `src/index.js` | The manifest describes a file that does not exist | `EN-04` |

## 6. Build and deployment

Nothing. No `Dockerfile`, no composition file, no continuous integration configuration, no
`.gitignore`, no `.env.example`, no `engines` field. The only script is `dev`, which launches
`nodemon`. The original `README` is five lines long and points to an external tutorial.

| Debt | Finding | Consequence | Corrected by |
|---|---|---|---|
| **DET-20** | No container, no continuous integration, no `.gitignore` | Nothing checks a contribution; no deliverable artefact | `EN-03`, `EN-07`, `EN-08` |
| **DET-21** | Default database path `/etc/todos/todo.db` | Local startup fails without privileges: the directory belongs to the system | `EN-03`, `EN-30` |
| **DET-22** | Port `3000` hard-coded in `src/index.js` | The port is not configurable, which a published image requires | `EN-08`, `EN-30` |
| **DET-23** | No required variable is validated; the application always starts | An incomplete configuration produces a failure further on, without a useful message | `EN-30` |
| **DET-24** | `overrides` pins seven transitive dependencies, without a comment or a date | Pins vulnerable versions never revisited. The pin of `tar` kept ten alerts open, one of them critical, until 3 September | `#101` |
| **DET-25** | `gracefulShutdown` calls `process.exit()` without closing the HTTP server | Ongoing connections are cut at shutdown | `EN-42` |

## 7. Data model

```sql
CREATE TABLE IF NOT EXISTS todo_items (id varchar(36), name varchar(255), completed boolean)
```

Run at startup, by each driver, without versioning.

| Debt | Finding | Consequence | Corrected by |
|---|---|---|---|
| **DET-26** | Schema created at startup, no migration | Every schema change is irreversible and untraceable | `EN-09` |
| **DET-27** | No primary key, no index, no constraint | Two rows can share the same identifier; every read by identifier scans the table | `EN-09` |
| **DET-28** | No notion of a user: `todo_items` has no owner | Authentication and GDPR compliance are impossible without redesigning the model | `EN-09`, `US-11`, `US-13` |

---

## What the audit concludes

**We do not evolve this codebase, we replace it layer by layer.** Twenty-eight debts, three of them
structural — no business layer, no owner in the model, no automatic check at all — which make each
feature addition more expensive than rewriting the layer concerned.

The order of treatment follows those three: `EN-04` makes the code testable, `EN-09` makes the
model able to carry a user, `EN-07` prevents regressions. Everything else depends on them.

## State as of 3 September

| Area | Debts | Corrected | Remaining |
|---|---|---|---|
| Structure | DET-01, DET-02 | both | — |
| Front end | DET-03 to DET-07 | DET-03, DET-04, DET-05, DET-06 | DET-07, partly (`EN-48`) |
| Responsibilities | DET-08 to DET-12 | DET-08 to DET-11 | DET-12 (`US-12`) |
| Tests | DET-13 to DET-15 | all three | — |
| Typing and quality | DET-16 to DET-19 | all four | — |
| Build and deployment | DET-20 to DET-25 | DET-20, DET-24 | DET-21, DET-22, DET-23 (`EN-03`, `EN-30`), DET-25 (`EN-42`) |
| Data model | DET-26 to DET-28 | — | all three (`EN-09`) |

Nineteen debts out of twenty-eight are corrected, and each one verifiably: by a test, by a check of
the integration pipeline, or by a reproducible run. The nine remaining ones are all attached to an
open backlog item; none is orphaned.

## Method

Findings established by reading commit `42752ef` file by file, then checked by running it: an
attempt to launch the inherited suite, starting the application, HTTP calls on the four routes,
inspection of the schema created. The consequences described were observed, not deduced.
