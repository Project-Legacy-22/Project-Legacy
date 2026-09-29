# Architecture

State as of 11 September 2026. This document describes what the repository contains, not a
target: every statement can be checked by reading the paths quoted.

## Split

An npm workspaces monorepo, split by domain and not by technical layer — this is the decision of
ADR-0003, taken because a horizontal split reproduced the coupling of the code taken over.

```
apps/
  api/        the Express server, the composition, the HTTP routes
  web/        the React interface served by Vite
  worker/     the event consumer, in its own process
packages/
  contracts/  the schemas shared between the API and the interface, and the event catalogue
  core/
    auth/         accounts, sessions, reset, personal data
    items/        tasks, Kanban statuses, priorities
    projects/     projects and memberships
    notifications/ notifications
  infra/      the adapters: Supabase, Redis, HIBP, the log
```

Each domain of `core/` has the same internal shape:

```
domain/       the types and the rules, which import nothing
application/  the use cases, which depend on the ports
ports/        the interfaces the infrastructure implements
```

## The dependency rule

`domain/` imports nothing — neither another domain, nor a port, nor a library. `application/`
only reaches the outside through `ports/`. `infra/` implements the ports and knows no use case.
Nothing, in `core/`, knows Express, React or Supabase.

This rule is checked by `scripts/check-layers.mjs`, wired into `npm run typecheck`. A script and
not the package graph, for a measured reason: npm workspaces hoists each dependency into the root
`node_modules`, so a file of `packages/core` resolves `express` while its `package.json` does not
declare it, and TypeScript compiles without a word. The package boundary documents the intent; it
does not enforce it.

## The flow of a request

`GET /projects/:projectId/items` goes through five stages, in this order:

1. **Express** — `apps/api/src/http/server.ts`. Security headers, CORS, body limit, log, static
   files.
2. **Session** — `apps/api/src/http/session.ts`. The `session` cookie is read, the identity asked
   of the provider, and renewed with the `refresh` cookie if the token has expired. Without a
   session, the request stops here with a `401` in `problem+json`.
3. **Route** — `apps/api/src/http/routes/items.ts`. The request is validated at the boundary by a
   schema of `contracts`, never later.
4. **Use case** — `packages/core/items/src/application/`. It decides, and only reaches the
   database through its port.
5. **Adapter** — `packages/infra/src/item-store.ts`. It translates to PostgREST, and the row-level
   security policies of Supabase filter by owner.

The composition assembles the five: `apps/api/src/composition-root.ts` is the only place where a
use case meets an adapter.

## The event flow

A single family of events today, `item.created`, in two versions (`docs/events/catalog.md`).

```
create a task
  └─ create_item_with_event  (one transaction: the task and its event)
       ├─ public.items
       └─ public.outbox                     the fact is written, nobody is notified yet
            └─ relay  ──publishes──▶  Redis  packages/infra/src/outbox-relay.ts
                                      └─ consumer  packages/infra/src/event-consumer.ts
                                           ├─ public.processed_events   absorbs a replay
                                           └─ public.notifications
```

The guarantee is the outbox, ratified by ADR-0013: the event and the fact share a transaction, so
a published event always matches something that happened. Delivery is at least once, and
`processed_events` makes a replay have no effect.

The relay runs differently depending on the target, and this is the only difference between them:

| Target | What runs the relay |
|---|---|
| Local process, Docker image | an interval, opened by `start()` |
| Serverless function | the write itself (`apps/api/src/after-write.ts`), plus a call to `POST /internal/relay` every thirty seconds by the `relais` workflow (ADR-0020) |

The consumer lives in `apps/worker` when a long-running process exists. On the serverless target,
the same consumption function is called by the delivery pass, without a second process.

## What keeps all this honest

| Check | What it prevents |
|---|---|
| `scripts/check-layers.mjs` | an import that crosses a layer boundary |
| `test/test-levels.test.ts` | a test file that no level runs any more |
| `test/sql-function-owners.test.ts` | two migrations that redefine the same function without seeing each other |
| `apps/api/src/http/vercel-rewrites.test.ts` | a route served by the application but unreachable once deployed |
| `apps/web/src/styles/contrast.test.ts` | a colour outside the palette, or a contrast below the threshold |
| `apps/web/src/styles/parse.test.ts` | a stylesheet the build would refuse |
| `test/coverage-exclusions.test.ts` | two coverage exclusion lists that diverge |

Each one was written after a real defect; the corresponding issues tell the story.

## References

- ADR-0003 (split by domain), ADR-0007 and ADR-0013 (events), ADR-0004 and ADR-0005 (database)
- `docs/events/catalog.md`, `docs/testing-levels.md`
