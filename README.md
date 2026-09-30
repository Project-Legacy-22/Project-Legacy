# Legacy 22

Legacy 22 takes over the TodoList application of `docker/getting-started-app` and turns it into
a maintainable Kanban application: accounts and sessions, projects shared between members, tasks
with a status, a priority and a due date, a Kanban board usable with the keyboard, a home screen of
what needs attention, notifications produced by an event flow, export and deletion of personal
data.

**What it is not**: neither a complete project management tool (no subtasks, comments,
attachments, custom columns or real time), nor a mobile application. These subjects are documented
as out of scope in the backlog, not improvised.

## Where it runs

| Target | Address | What it serves |
|---|---|---|
| Production | <https://project-legacy-web-legacy-9eee.vercel.app> | the `main` branch, front end and API on the same origin |
| Previews | one address per pull request and for `dev`, in the checks of the PR | the code of the branch, on the same database as production |
| Docker image | `ghcr.io/project-legacy-22/project-legacy` | every release on `main`, for a run outside Vercel |
| Development workstation | <http://localhost:5173> | after `npm run up`, with a local database and broker |

Production does not serve the worker: on Vercel, the event delivery pass is triggered by the write
itself and by a call every thirty seconds (`docs/ci.md`, ADR-0020). It contains no demonstration
account: those only exist on the local stack.

## Documentation

| Subject | Where |
|---|---|
| Architecture, layers, request flow and event flow | [docs/architecture.md](docs/architecture.md) |
| Decisions and their reasons | [docs/adr/](docs/adr/README.md) |
| Event catalogue | [docs/events/catalog.md](docs/events/catalog.md) |
| Continuous integration, release, deployment | [docs/ci.md](docs/ci.md) |
| Each delivered feature, its rules and its error cases | [docs/features/](docs/features/README.md) |
| Test levels | [docs/testing-levels.md](docs/testing-levels.md) |
| GDPR register of processing activities | [docs/gdpr/registre.md](docs/gdpr/registre.md) |
| Backup, restore and leaving Supabase | [docs/backup-and-exit.md](docs/backup-and-exit.md) |
| Import of the data of the former application | [docs/data-migration.md](docs/data-migration.md) |

## Commands

| Command | What it does |
|---|---|
| `npm run up` | starts everything: broker, database, API, front end and worker |
| `npm run down` | stops the broker and the database |
| `npm run dev` | API and Vite server, reading `.env` |
| `npm run dev:api`, `npm run dev:web`, `npm run dev:worker` | a single stage, for example the worker during a demonstration |
| `npm run lint` | static analysis on the whole repository, `apps/web` included |
| `npm run typecheck` | types of production code and tests, web workspace, then check of the layer boundaries |
| `npm test` | unit, HTTP and front-end tests, with a single coverage report in `coverage/` |
| `npm run test:unit`, `npm run test:http`, `npm run test:dom` | a single level of the suite above |
| `npm run test:integration` | tests against the local Supabase stack and the broker, which must be running |
| `npm run test:migration` | import and export of the data, replayed on three engines in containers |
| `npm run build` | production build, front end written to `apps/api/dist/static` |
| `npm start`, `npm run start:worker` | the production build of the API, of the worker |
| `npm run db:start` | local Supabase stack and application of the migrations |
| `npm run db:reset` | replays the migrations from an empty database, then the demonstration dataset |
| `npm run db:types` | regenerates the TypeScript types of the schema |
| `npm run db:lint` | static checks on the schema |
| `npm run backup` | backup of the linked hosted project, see [docs/backup-and-exit.md](docs/backup-and-exit.md) |
| `npm run data:export`, `npm run data:import` | export and import of the data, see [docs/data-migration.md](docs/data-migration.md) |

## Prerequisites

| Tool | Version | Where it is set |
|---|---|---|
| Node.js | 22.12.0 recommended; `^20.19.0` or `>=22.12.0` accepted | `.nvmrc`, `engines` field of `package.json` |
| npm | the one shipped with Node, 10 or later: the workspaces and `npm ci` depend on it | |
| Docker | a running engine, with `docker compose` (v2) | the local database and the broker run in containers |

The Supabase CLI does not need to be installed: it is a development dependency (`supabase` in
`package.json`), called through `npx supabase` from the scripts. With `nvm`, `nvm use` reads
`.nvmrc`.

## Organisation

```text
api/                     Entry point of the Vercel function, which serves the Express application
apps/
├── api/                 Express API and composition of the application
├── web/                 React interface built with Vite
└── worker/              Event consumer, a separate process
packages/
├── contracts/           zod schemas and types shared at the boundaries
├── core/auth/           Domain and use cases of authentication
├── core/items/          Domain and use cases of the tasks
├── core/projects/       Domain and use cases of the projects and their members
├── core/notifications/  Domain and use cases of the notifications
├── data-migration/      Import and export of the data, without dependencies
└── infra/               Adapters: Supabase, Redis, identity, metrics, logging
supabase/                Versioned migrations, local configuration, demonstration dataset
test/                    Cross-cutting tests: levels, migrations, register of SQL functions
docs/                    Architecture, ADRs, features, CI, GDPR
```

The front end uses the contracts of `packages/contracts` to validate the responses of the API. It
does not depend directly on the domain or infrastructure modules.

## Getting started

Two commands from a freshly cloned repository, only one of which is repeated afterwards:

```bash
npm ci        # installs exactly the dependencies of the lockfile
npm run up    # starts the broker, the database, the API and the front end
```

`npm run up` chains the broker declared in `compose.yaml`, the local Supabase stack and its
migrations, then the API and the Vite server. It passes to the application the coordinates printed
by the Supabase CLI: no file to copy, no value to fill in by hand.

- Front end with hot reload: http://localhost:5173
- API: http://localhost:3000
- Supabase Studio: http://localhost:54323
- The `/auth`, `/projects` and `/notifications` requests of the front end are forwarded to the API by the Vite proxy.

`Ctrl+C` stops the API and the front end. The broker and the database stay up, with their data;
`npm run down` stops them. Running `npm run up` again resumes from the state left the previous
time.

If Docker is not running, the command stops and says so rather than failing further on with a
connection error.

## Environment variables

`.env.example` is the reference: it lists every variable read, without any real value.
`apps/api/src/config.ts` is the only module that reads the environment; everything else receives
typed values. Adding a variable elsewhere would create a second configuration source, which the
example file would stop describing.

| Variable | Origin | Role, and what happens if it is missing |
|---|---|---|
| `SUPABASE_URL` | `supabase status -o env` locally, Supabase dashboard otherwise | entry point of the database. Required: the API refuses to start and names it |
| `SUPABASE_SERVICE_ROLE_KEY` | same | service key, never leaves the server. Required |
| `SUPABASE_ANON_KEY` | same | public key used by authentication. Required |
| `REDIS_URL` | `compose.yaml` locally, Upstash on Vercel | event broker. Required for whoever relays or consumes: the API `start()` asks for it, the worker refuses to load without it. A deployment that only serves HTTP can do without it |
| `RELAY_SECRET` | to generate, at least 32 characters | secret of `POST /internal/relay`, `/internal/metrics` and `/internal/state`. When absent, these routes do not exist |
| `WEB_ORIGIN` | the address of the front end | the only origin allowed for a cross-origin call. `http://localhost:5173` by default |
| `TRUST_PROXY` | `1` behind a proxy, as on Vercel | number of proxies whose forwarded address is trusted, key of the rate limiter. `0` by default |
| `NODE_ENV` | `production` in production | sets `Secure` on the session cookies. `development` by default |
| `LOG_LEVEL` | | pino level among `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. `info` by default; an unknown value prevents startup |
| `REDIS_PORT` | | host port of the local broker, `6379` by default |
| `WORKER_BLOCK_SECONDS` | | blocking wait of the worker between two reads, `5` by default |
| `SUPABASE_AUTH_SMTP_PASS` | email provider | read by `supabase/config.toml` only to push the email sending configuration; useless locally, where the mail catcher is enough |

`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF` and `VERCEL_ENV` are set by Vercel and name the
version that responds in the metrics; nothing requires them elsewhere.

A missing required variable stops the API at startup with a message that names it, rather than
letting it fail on the first request.

The values of the local stack are obtained with `npm run db:start`, or at any time with
`supabase status -o env`. `npm run up` reads them and passes them on itself.

A workstation already running a Redis on the default port cannot publish it a second time. In that
case, choose another port without changing anything in the repository:

```bash
REDIS_PORT=6380 npm run up
```

Copying `.env.example` to `.env` is only useful to run `npm run dev` or `npm start` on their own,
without going through `npm run up`.

### No secret in the repository

Production values come from the Supabase dashboard and are never versioned. `.env` and its
variants are excluded by the `.gitignore`, except `.env.example`.

No automatic secret scan runs in continuous integration: the one that existed was removed because
it failed permanently on test values, and a check that is always red no longer informs anybody.
The rule does not change for all that: a secret in a pull request gets it refused at review, and a
value published by mistake is revoked, not only removed, since the history keeps it.

## Database

The schema results from versioned migrations in `supabase/migrations/`, never from a
`CREATE TABLE` at startup. The naming and header conventions are in
[`supabase/README.md`](supabase/README.md).

```bash
npm run db:start     # starts the local Supabase stack (Docker) and applies the migrations
npm run db:reset     # replays every migration from an empty database, then supabase/seed.sql
npm run db:types     # regenerates packages/infra/src/database.types.ts after a migration
npm run db:lint      # static checks on the schema
```

### Demonstration data

`supabase/seed.sql` loads a demonstration dataset on every `npm run db:reset`, and on the first
`npm run db:start` of a new stack. It creates two accounts, three projects, tasks spread over the
three columns with priorities and due dates (including one overdue and one due on the day of
loading) and an unread notification. The due dates are computed from the day the dataset is
loaded: running `npm run db:reset` again before a demonstration brings them up to date.

| Account | Password | Content |
|---|---|---|
| `camille.demo@example.com` | `DemoLegacy2026` | two projects, an unread notification |
| `hugo.demo@example.com` | `DemoLegacy2026` | one project |

These accounts only exist on the local stack. The file refuses to run on any database that does
not use the JWT secret published by the Supabase CLI for local development: a hosted database never
receives this dataset, even through `supabase db reset --linked`. The addresses are on
`example.com` and the names are made up.

## Starting the stages separately

`npm run up` covers the common case. The commands below are useful when acting on a single stage,
for example restarting the application without touching the database.

```bash
docker compose up -d     # the broker alone
npm run db:start         # the database and its migrations
npm run dev              # the API and the front end, reading .env
```

The API refuses to start if `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` is
missing, naming the missing variable.

## Authentication

Sessions and passwords are managed by Supabase Auth ([ADR-0008](docs/adr/0008-strategie-de-session-supabase-auth.md)).

| Route | Effect |
|---|---|
| `POST /auth/register` | Creates an account. Always answers `201`, without a body or a session |
| `POST /auth/login` | Opens a session: two `httpOnly` cookies, access token and refresh token |
| `GET /auth/me` | Returns the account of the current session, or `401` |
| `POST /auth/logout` | Closes the session and clears the cookies |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | Password reset through a link |
| `PUT /auth/me/password`, `PUT /auth/me/email`, `POST /auth/me/email/confirm` | Change of the password and of the address |

An expired session is renewed on the request that presents it, as long as the refresh cookie is
valid ([docs/features/28-session-lifetime.md](docs/features/28-session-lifetime.md)).

Every `/projects` route requires a valid session. Items are reachable under the project they belong
to.

## API documentation

Each route, its parameters, its bodies, its responses and its error codes are described in the
OpenAPI 3.1 format, generated from the validation schemas of `packages/contracts`:

- browsable at <https://project-legacy-22.github.io/Project-Legacy/api/>, published on every
  integration into `dev`;
- versioned in [docs/api/openapi.json](docs/api/openapi.json), regenerated by
  `npm run docs:api`. A gap between this file and the code fails the tests, hence the pull
  request.

## Projects and items

Each account receives a default project when it registers. It can create other projects, view
those it is a member of and delete those it owns. A project deletion is confirmed in the interface
with its name and the number of items that will be erased, then deletes those items in cascade.

The item routes are nested under `/projects/:projectId/items`. Access depends on membership of the
project, not on the account that created the item: every member sees and modifies the same items.
A non-member receives the same `404` as for a project or an item that does not exist, for reads as
for writes.

`GET /projects` and `GET /projects/:projectId/items` are paginated. `limit` is 20 by default, is
capped at 100, and `cursor` continues from the previous response; outside these bounds, `400`. The
cursor is opaque and designates the last row served rather than an offset, so that a concurrent
creation neither skips nor repeats a row.

A task has a status `todo`, `doing` or `done`. A move uses the version returned with the task; an
outdated version receives `409` and does not replace the stored state. It also carries a priority
`low`, `normal` or `high`, normal by default, and an optional calendar due date. Lists put high
priorities first, then the nearest due dates; the identifier breaks ties between equivalent tasks
reproducibly.

Two behaviours are intentional and must not be "fixed":

- account creation answers the same way whether the address is free or already taken, and never
  opens a session. Any difference of status, body or header would reveal which addresses have an
  account;
- a failed sign-in does not distinguish a wrong password from an unknown address.

The password policy is applied twice, in the domain and by the configuration of the provider:
twelve characters mixing lower case, upper case and digits, capped at 72 bytes, the limit beyond
which bcrypt silently truncates. It is exported by `packages/contracts` under the name
`PASSWORD_POLICY`, so that the interface can state it before input.

The check against a list of compromised passwords does not exist in the local configuration: it is
a setting of the Supabase dashboard, to enable on the hosted project.

Account creation and sign-in attempts share a limit of ten per five-minute window and per calling
address. The security headers and the CORS restriction belong to `EN-29`.

## Personal data

Two routes carry the rights of portability and erasure (`US-13`). They act on the account of the
session and accept no identifier: a route that took one would be a route that can be pointed at
somebody else.

| Route | Effect |
|---|---|
| `GET /auth/me/export` | Serves as JSON the account, its projects, memberships, items and notifications |
| `DELETE /auth/me` | Deletes the account, without delay, after confirmation |

The notifications and the traces of the event flow are not kept indefinitely: a daily purge applies
the durations of the register of processing activities (`US-39`). Its trigger, its frequency and
where to read its result are in [docs/ci.md](docs/ci.md#retention-purge).

The export is assembled on demand and served as is: nothing is written to disk, so no copy remains
to protect or purge. A deleted task is physically erased and therefore no longer appears in the
data held or in the export.

Deletion requires the request body to repeat the address of the account
(`{ "confirmation": "..." }`), otherwise it answers `422`. It physically erases the rows concerned
in a single transaction. It removes the memberships, deletes the projects of which the account is
the last member and keeps the shared projects. It then deletes the credentials at the provider,
which revokes every session. The order is deliberate: an attempt interrupted between the two steps
can be run again, the reverse would leave data behind an inaccessible account. There is neither a
grace period nor a way back.

Full detail in [docs/features/14-export-and-delete-account.md](docs/features/14-export-and-delete-account.md).
Grouping by project is described in
[docs/features/17-projects.md](docs/features/17-projects.md).
Removing a member, who keeps their account and the tasks of the project, is described in
[docs/features/354-remove-project-member.md](docs/features/354-remove-project-member.md).

The Kanban board and its accessible moves are described in
[docs/features/16-kanban-move.md](docs/features/16-kanban-move.md).
Editing, completing and deleting tasks is described in
[docs/features/32-edit-complete-delete-task.md](docs/features/32-edit-complete-delete-task.md).

## Production build

Build the API, the packages and the front end:

```bash
npm run build
```

Vite writes the optimised bundle to `apps/api/dist/static`. The Express API then serves the front
end and the HTTP routes on the same port. With the local stack started and `.env` in place:

```bash
npm start
```

The application is then available at http://localhost:3000.

## Running the published image

Every release on `main` publishes an image to GitHub Container Registry. It contains the API and
the built front end, served on the same port: there is nothing else to deploy.

```bash
# The sha-<short> tag goes back to the exact commit that produced the image.
docker pull ghcr.io/project-legacy-22/project-legacy:latest

docker run --rm -p 3000:3000 \
  -e SUPABASE_URL=https://<project>.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=<service role key> \
  -e SUPABASE_ANON_KEY=<public key> \
  -e NODE_ENV=production \
  ghcr.io/project-legacy-22/project-legacy:latest
```

The `pull` requires authentication with GHCR: `docker login ghcr.io` with a personal token that has
the `read:packages` permission.

### Environment variables

| Variable | Role | Default |
|---|---|---|
| `SUPABASE_URL` | URL of the Supabase project | none, required |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key of the project, never leaves the server | none, required |
| `SUPABASE_ANON_KEY` | public key, used by authentication | none, required |
| `NODE_ENV` | `production` marks the session cookie `Secure` | `development` |
| `LOG_LEVEL` | logging level | `info` |

The development values are those of the local stack, published by `npm run db:start` and repeated
in `.env.example`. The production values come from the Supabase dashboard and are never versioned.
Hardening the configuration and scanning for secrets are the subject of `EN-30`.

The image runs as an unprivileged user and contains neither development dependencies, nor
TypeScript sources, nor an environment file.

## Vercel deployment

`vercel.json` holds the build configuration of the front end. Vercel installs at the root of the
repository and builds only the `@legacy/web` workspace:

| Setting | Value | Why |
|---|---|---|
| `installCommand` | `npm ci --include=dev` | `typescript` is only declared at the root: installing from `apps/web` does not install it. And `--include=dev` is essential because `NODE_ENV=production`, needed at runtime for the cookie to carry `Secure`, is also visible at build time and makes npm skip the `devDependencies`. |
| `buildCommand` | `npm run build` | the root command, the one the CI runs. It runs `tsc --build` before Vite: without that step, `@legacy/contracts` is not compiled and the front end does not find its types. |
| `outputDirectory` | `apps/api/dist/static` | Vite already writes there, the API serves this directory in production |
| `ignoreCommand` | diff between the last deployed commit and the head, on `api`, `apps`, `packages`, the lockfile and this file | a push that only touches the API does not trigger a build. The comparison starts from `VERCEL_GIT_PREVIOUS_SHA` and not from `HEAD^`, otherwise a push of several commits would only examine the last one. Without that variable, the build happens. A redeployment of the same commit builds too: both identifiers are then equal, and a change of environment variable does not touch Git. The command only exits with 0 or 1, the only codes Vercel interprets: any other code is treated as a build failure. |

**Settings of the Vercel project**, to set in the dashboard and not here: *Root Directory* at the
root of the repository, and *Production Branch* on `main`. Previews are then triggered on `dev`
and on every pull request, production on `main` only.

### The API on the same deployment

`api/index.ts` exports the Express application, and `vercel.json` rewrites `/auth`, `/projects`,
`/notifications` and `/internal` to it; `/reset-password` and `/confirm-email-change`, links
received by email, serve the front-end page.
The browser therefore sees a single origin, which is the condition for the `httpOnly` session
cookie to work — `apps/web/vite.config.ts` explains why an API on another origin would put it out
of reach.

The function consumes the build output (`apps/api/dist`) rather than the sources: typing comes from
the generated declarations, and the deployment entry point consumes an artefact rather than
recompiling.

It does not call `application.start()`. That health check serves a long-running process that must
refuse to start when misconfigured; a function does not have that life cycle, and `supabase-js`
holds no connection to open.

**What this does not host**: no long-running process survives in serverless, so neither the worker
nor the relay interval. The delivery pass is called there by the write itself and by the `relais`
workflow, every thirty seconds, on `POST /internal/relay`; the same pass publishes then consumes
([docs/architecture.md](docs/architecture.md), section "The event flow"). The image published on
GHCR remains the deliverable for running in a container.

### Variables to set on Vercel

The API refuses to start if one is missing, naming it. They point to a hosted Supabase project,
distinct from the local stack.

| Variable | Origin |
|---|---|
| `SUPABASE_URL` | dashboard of the hosted project |
| `SUPABASE_SERVICE_ROLE_KEY` | same, never to be exposed to the browser |
| `SUPABASE_ANON_KEY` | same |
| `NODE_ENV` | `production`, so that the session cookie carries `Secure` |
| `TRUST_PROXY` | `1`: Vercel is a proxy, and the rate limiter must read the address it forwards |
| `RELAY_SECRET` | the same as the `RELAY_SECRET` secret of the repository, which the `relais` workflow presents |
| `REDIS_URL` | set by the Upstash integration of the Vercel project |

A merged migration must reach the hosted project before the code that uses it: the previews and
production share this database. `supabase link` then `supabase db push` apply it, and the
`migrations` workflow (#385) does it after each green integration on `dev`. A migration must
therefore remain additive: production still runs the code of the last release when it receives it.

## Local checks

```bash
npm run typecheck
npm test
npm run build
```

| Command | Role |
|---|---|
| `npm run dev` | Starts the API and Vite |
| `npm run dev:api` | Starts only the API in watch mode |
| `npm run dev:web` | Starts only Vite |
| `npm run db:start` | Starts the local Supabase stack and applies the migrations |
| `npm run db:reset` | Rebuilds the local database from the migrations and `supabase/seed.sql` |
| `npm run db:types` | Regenerates `packages/infra/src/database.types.ts` |
| `npm run db:lint` | Static checks on the schema |
| `npm run typecheck` | Checks TypeScript and the boundaries between modules |
| `npm test` | Runs the unit, HTTP and front-end tests, including the axe check |
| `npm run build` | Produces the complete production build |
| `npm start` | Starts the production build |

## Front-end accessibility

The foundation of the front end targets WCAG 2.1 level AA:

- semantic structure with a main heading and identified regions;
- keyboard navigation and visible focus;
- fields associated with their labels, hints and errors;
- action feedback announced to assistive technologies;
- text and component contrasts checked;
- reduced animations with `prefers-reduced-motion`;
- axe check run with the tests.

A manual check with the keyboard and on mobile formats completes the automatic check before each
review request.
