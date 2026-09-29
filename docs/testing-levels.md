# The test levels

Purpose of this page: looking at a test, know which level it belongs to, what it is allowed to
assume, and what has no business being there. The vocabulary is that of
`standards/03-testing.md`, section 1. This page does not replace it, it says how it translates in
this repository.

The file patterns of each level live in `vitest.levels.ts`, in a single place, because
`vitest.config.ts`, `vitest.integration.config.ts` and the guard below read the same ones.

## The four levels that exist

| Level | Command | Where its files live |
|---|---|---|
| `unit` | `npm run test:unit` | `packages/**`, plus two pure files of `apps/api/src` |
| `http` | `npm run test:http` | `apps/api/src/http/routes/**` |
| `dom` | `npm run test:dom` | `apps/web/src/**` |
| `integration` | `npm run test:integration` | `apps/api/test/integration/**`, local stack required |

The exact patterns are in `vitest.levels.ts`; this column summarises them. No count of files or
cases here: it would go stale with the next test added, and this page would then be wrong without
anything reporting it -- exactly what the guard further down exists to prevent elsewhere. For
today's figures, `npm test`.

`npm test` runs the first three together and produces **the** coverage report. It is not the sum of
three commands: two partial reports would make any threshold impossible to interpret, which the
comment of `vitest.config.ts` already said before this split. The per-level commands serve the
short loop during development, never the measurement.

The names are those of the levels, not of the runtimes. `node` and `jsdom` describe an environment,
which says nothing about what a test is allowed to assume.

### `unit`

`packages/**`, plus `apps/api/src/config.test.ts` and `apps/api/src/http/cookies.test.ts`.

**What is tested there**: the domain and the application of the `core` packages, the shared schemas
of `contracts`, the translation done by the adapters of `infra`, and the pure functions of
`apps/api` that mount no server.

**What a test can assume**: nothing external. Everything behind a port is a hand-written fake that
actually implements the port. The clock and the identifier generator are injected, so the test is
deterministic without waiting for anything.

**What has no business there**: a real server, a real database, a real bus, a real clock, a
`sleep`.

### `http`

`apps/api/src/http/routes/**`.

**What is tested there**: the wiring of a route. A real Express server listens on port 0 and is
queried with `fetch`, with fakes behind the ports. What is checked is the HTTP code, the header, the
rendered body, the cookie set.

**What a test can assume**: that the business rule called is already checked at the `unit` level. A
route test does not have to prove a domain validation rule again; it checks that the route delegates
to it and translates its result.

**What has no business there**: a domain rule, a real database, a real bus.

### `dom`

`apps/web/src/**`.

**What is tested there**: components mounted in jsdom by `apps/web/src/test/react-root.tsx`, queried
by CSS selector. The rendered states, the announced labels, the tab order, the contrast of the
colour tokens, and the violations detectable by `axe-core` on `wcag2a`, `wcag2aa` and `wcag21aa`.

**What a test can assume**: that the harness tells the truth. It is itself tested, by
`apps/web/src/test/react-root.test.tsx`, against hand-written DOM -- otherwise an error in it would
make green a test that should be red, without any failure to report it.

**What a test cannot assume**: that jsdom behaves like a browser. It implements neither sequential
keyboard navigation nor the implicit submission of a form, and computes no effective colour --
`color-contrast` is therefore disabled in every `axe` pass, and contrast is checked another way, by
reading the tokens and computing the relative luminance. The keyboard simulation loops from the last
element to the first where a browser would move out to its own toolbar: nothing can conclude about
leaving the page.

**What has no business there**: a real network call, an assertion on a computed colour, a journey
that crosses several pages.

### `integration`

`apps/api/test/integration/**`, separate configuration and command.

**What is tested there**: a real route against a real database. It is the only level that proves
that an RLS policy does what it announces, and that the outgoing adapters actually talk to
PostgREST.

**What a test can assume**: that the local Supabase stack runs (`npm run db:start`). This is why it
is not part of `npm test`, which everybody runs on every change.

**What has no business there**: a case that can be checked without a database. These tests cost
seconds where the others cost milliseconds.

## The level that does not exist

**Browser E2E.** Carried by #27 (`EN-26`), classified `Could`, blocked by `US-15`.

The only serious argument for adding it now was contrast, which jsdom cannot compute. It is solved
another way, by the token test of the `dom` level. Browser journeys would moreover cover screens
that are going to change.

**Signal that would call this decision into question**: the day an acceptance criterion can no
longer be checked outside a browser. Contrast was one; it no longer is.

## The guard that holds the partition

`test/test-levels.test.ts` checks two things on the patterns of `vitest.levels.ts`:

- each **versioned** test file belongs to a level;
- none belongs to two.

Without it, a test file placed outside every pattern would be run by nothing, and **nothing would
say so**: the suite would simply become quieter, without a single failure. It is the form of loss
that is most expensive to find again.

Its limit is in its name: it only sees what `git ls-files` knows. An unversioned file escapes the
check, but it also escapes the repository.

## Two gaps with the standards, to be arbitrated by the team

Neither is corrected here: `standards/` lives in another repository and is authoritative on its
subject. Noting them is the minimum; changing them is a team decision.

**The table of `03-testing.md` section 1 has three rows** -- Unit, Integration, E2E -- where this
repository distinguishes three families before integration. The `unit`, `http` and `dom` levels all
belong to the "Unit" row in the sense of the standard, since everything behind a port is a fake
there. The table therefore does not name the difference between checking a rule and checking the
wiring that calls it.

**`07-quality-gates.md` section 3 names a `test:unit` step that carries the coverage.** In this
repository, it is `npm test` that carries it, and `npm run test:unit` is the short loop without
coverage. The name in the standard and the one in the repository do not designate the same thing.

## What other issues carry

| Layer | Carried by |
|---|---|
| Contract between components | #24 (`EN-23`) |
| Browser end to end | #27 (`EN-26`) |
| Accessibility and keyboard | #181 (`US-14a`) |
| Event flow | #179 (`EN-50b`) |
| Measurement blind spots | #180 (`EN-50c`) |
| Cohesion of the harnesses between branches | #170 |
