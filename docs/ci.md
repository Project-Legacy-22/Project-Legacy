# The continuous integration pipeline

What GitHub Actions runs, when, and what prevents a pull request from being integrated. State as of
12 September 2026; every statement can be checked in `.github/workflows/`.

## The eight workflows

| Workflow | Triggered by | What it does |
|---|---|---|
| `ci` | every pull request, every push on `dev`, and called by `image` | the nine checks detailed below |
| `codeql` | pull request, push, and once a week | GitHub static security analysis |
| `guard-branches` | every push | refuses a commit that does not have the expected origin |
| `image` | push on `main` | replays `ci`, then publishes the image on GHCR and creates the release |
| `migrations` | every green `ci` run on `dev`, or by hand | applies to the hosted database the migrations it does not have yet |
| `purge` | once a day at 03:17 UTC, or by hand | one pass of the retention purge on the deployment (US-39): durations of the register of processing activities, result in the summary of the run |
| `pages` | push on `dev` | publishes the coverage report on GitHub Pages |
| `relais` | continuously, restarted by itself; the five-minute cron only serves to restart the chain | one delivery pass of the outbox every thirty seconds for 345 minutes, the measurements summed to Grafana Cloud every ten passes (ADR-0020) |

## The nine checks of `ci`

The job names are those displayed in the checks of a pull request.

| Job | What it checks | What it catches |
|---|---|---|
| `Types et style` | `tsc --build`, `scripts/check-layers.mjs`, ESLint | a wrong type, an import that crosses a layer boundary, a line count or complexity ceiling exceeded |
| `Tests et couverture` | `npm test` with aggregated coverage | a behaviour regression, a coverage below the thresholds: 70 % for lines, statements and functions, 60 % for branches |
| `Tests d integration` | the local Supabase stack, migrations applied | what only a real database shows: row policies, transactions, session revocation |
| `Qualite (SonarCloud)` | analysis and **wait for the verdict of the gate** | duplication, complexity, security, coverage as seen by the tool |
| `Audit des dependances` | `npm audit --audit-level=high` | a high or critical vulnerability in a dependency; a moderate one does not block |
| `Build` | `npm run build` | what the tests do not see: an invalid stylesheet, a bundle that does not build |
| `Image Docker` | building the image without publishing it | a broken Dockerfile, before a release discovers it |
| `Migrations et schema` | replays every migration on a new database | a migration that does not apply in order |
| `Migration de donnees` | **at release only**: three engines in containers, both directions replayed | an import or an export that no longer works, hence a reversibility that has become theoretical |

The last job does not run on every pull request: its condition is
`github.base_ref == 'main' || github.ref == 'refs/heads/main'`, so the release pull request and the
push that follows it. Starting three engines to check code that rarely changes would cost a minute
and a half on every review; a release, on the other hand, is exactly the moment when reversibility
must be proven. `npm run test:migration` replays the same suite locally.

## What blocks an integration

The branch protection of `dev` requires three things, and they can be checked through the API:

- **an approval** from another person;
- **the `Qualite (SonarCloud)` context green** — the only required context, and it is deliberate: it waits for the verdict of the gate, so it encompasses what the others measure;
- **every review conversation resolved**.

`enforce_admins` is active: the rule also applies to whoever administers the repository. `main`
has the same approval requirement.

Two consequences the team ran into, and that are better known in advance:

A required check that is **skipped** is not satisfied for GitHub. This is why the SonarCloud job
skips its analysis *step* rather than the whole job when it has no reason to run — on a Dependabot
pull request, whose secret store refuses the token, and on a push to `main`, where the free plan
does not analyse a second branch.

A workflow called by another receives **no secret** without `secrets: inherit`. Without that line,
`image` ran `ci` with an empty SonarCloud token, the analysis failed, and the image publication was
skipped without anyone understanding why.

## The path of a change

```
work branch  ──pull request──▶  dev  ──tk release──▶  main
      │                          │                      │
      ci + codeql             ci + pages          image: ci, then GHCR + release
```

`main` is never reached by merging a work branch: only a release from `dev` goes there, and it is
done through a merge commit so that the two branches do not diverge while their content is
identical.

## Where the code runs, and how it gets there

The Actions check and publish an image; they do not deploy. Deployment is done by Vercel, connected
to the repository.

| | |
|---|---|
| Production | the `main` branch |
| Preview | `dev` and every pull request, at their own address |
| Runtime region | `cdg1`, Paris |
| Build | `npm run build`, output `apps/api/dist/static`, framework `vite` |

A preview deployment per pull request is what makes it possible to review an interface change
without installing it: the address appears in the checks of the pull request, next to the nine
checks.

**What `vercel.json` decides.** The paths `/auth/*`, `/projects*`, `/notifications*` and
`/internal/*` are routed to the function; everything else is served by the front end. A route
mounted by the application but missing from this list would answer a Vercel 404, without ever
reaching the code — and `apps/api/src/http/vercel-rewrites.test.ts` compares both lists in both
directions so that this cannot happen silently.

**The GHCR image is a second artefact, not the production path.** It is published by the `image`
workflow on every release on `main`, so that running outside Vercel is possible. Production, for
its part, is served by Vercel.

## Health check and event correlation

`GET /health` is public and requires no session. It queries the database through a read without
content of the `users` table, and Redis through the depth of the event queue. Both probes have a
three-second limit and run in parallel. The response is 200 when both services respond, 503
otherwise. It only contains `status` (`ready` or `unavailable`) and `dependencies.database` /
`dependencies.broker` (`up` or `down`): no internal address, version, account data or raw error.
The `Cache-Control: no-store` header prevents an old state from being taken for the current one.

On Vercel, `/health` is rewritten to the API function like the other routes. On a deployment of the
Docker image, `docker inspect --format '{{json .State.Health}}' <container>` shows the result of the
`HEALTHCHECK`. To see which dependency no longer responds, call `GET /health` on the URL of the
deployment; no key is needed. The image also serves the worker, which serves no HTTP: if it is
started with the worker command, use `--no-healthcheck` and supervise the worker process
separately. A 503 does not expose the raw cause; look for it in the API logs and in the protected
measurements under `/internal`.

Correlation between HTTP and event does not change the contract of the envelope. After the atomic
write of a task or an invitation and of its event, the producer logs `traceId` and `eventId`
together. The log of the HTTP request carries the same `traceId`; the relay and the consumer carry
`eventId`. First search for the `traceId` of an HTTP error, then for its `eventId` in the logs of
the relay and of the worker. An event not created (invitation already pending or write refused)
produces no `event recorded` line. No task content, email address or event payload is logged.

**State as of 15 September 2026**, measured through the Vercel API and the workflow history:

- production serves commit `3deb3cb`, deployed on 11 September from `main` — release #235.
  Everything `dev` has received since only exists in preview;
- the GHCR image and the release, for their part, date from **3 September**. The `image` workflow
  failed on the push of 11 September, at the SonarCloud step, and the publication step was
  therefore skipped.

The two artefacts are therefore not at the same level, and it is written here rather than assumed:
a document that let one believe the image follows production would be wrong.

## Migrations of the hosted database

Production and the previews share a single hosted Supabase project. On 23 September 2026, six
migrations merged into `dev` had never been applied to it: the code of #382 read `items.position`,
which was missing, and the previews answered 500 on the task list. They were applied by hand after
a backup; the `migrations` workflow now does this work (#385).

**When.** After every **green** `ci` run on `dev`, on the commit `ci` checked, and never on a commit
that arrived in the meantime. `ci` has already replayed every migration on an empty database: what
arrives here has therefore been applied once elsewhere. Without a new migration, the dry run lists
nothing and the application does nothing. A manual trigger (`workflow_dispatch`) remains possible.
Two runs never overlap: they follow each other.

**What goes out** is listed in the summary of the run before being applied.

**The resulting rule: a migration is additive.** The database being shared, a migration reaches
production as soon as it is merged into `dev`, while production still runs the code of the last
release. It must therefore be compatible with that code: add a column with a default value, a
table, a function, or redefine a function without changing its signature. A rename, a removal or a
signature change happens in two steps: the migration that adds, released; then, after the release
of the code that no longer reads the old one, the one that removes.

**Configuration**, in the settings of the repository:

| Name | Kind | Content |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | Supabase access token of an account member of the organisation of the project, created for this use |
| `SUPABASE_DB_PASSWORD` | secret, optional | database password of the hosted project; without it, the CLI opens a temporary login role with the token (#392) |
| `SUPABASE_PROJECT_REF` | variable | identifier of the hosted project, visible in its URL |

As long as the token or the project identifier is missing, the workflow fails at its first step and
names what is missing: an application that does not happen must be seen, not pass for an
up-to-date database. The CLI reads the token and the password from the environment; neither is
passed as a command argument.

## Retention purge

**When.** The `purge` workflow runs once a day, at 03:17 UTC, and can be started by hand
(`workflow_dispatch`). The GitHub scheduler is sometimes hours late; the durations are counted in
days, so that delay changes nothing. Two runs do not overlap.

**What it does.** A `POST /internal/purge` call on `RELAY_URL`, with `RELAY_SECRET`, the same
settings as the relay. The route runs `public.purge_expired_data`, which deletes the notifications
and the processed events older than ninety days and the events published more than seven days ago.
An event never published is never deleted. The durations are decided in `docs/gdpr/registre.md`.

**Where to read the result.** In the summary of each run of the `purge` workflow, Actions tab: the
date and, per processing activity, the number of rows deleted. The API logs carry the same
information, one `retention purge` line per processing activity. Neither contains personal data.

**When it fails.** If `RELAY_URL` or `RELAY_SECRET` is missing, or if the route does not answer
200, the run fails and says so: a purge that does not happen must be seen. The next one resumes
where this one stopped, since a pass does not depend on the previous one.

## References

- `.github/workflows/`, `sonar-project.properties`, `vercel.json`
- ADR-0009 (SonarCloud as the quality gate tool), ADR-0015 (GHCR as the registry)
