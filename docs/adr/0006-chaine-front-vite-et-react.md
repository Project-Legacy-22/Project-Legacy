# ADR-0006 — Vite for the front-end toolchain, React kept

- **Status**: Accepted
- **Date**: 2026-09-02
- **Deciders**: whole team, kickoff meeting
- **Related issue**: #2

## Context

The legacy front end is transpiled **in the browser**: `index.html` loads `babel.min.js` then
`app.js` as `type="text/babel"`. React, ReactDOM, React-Bootstrap and Font Awesome are files
copied into the repository (`DET-03`). There is no build, no bundling, and no declared or
updatable dependency.

The subject asks us to correct the tooling debt. It does not ask us to change the interface
library.

## Options considered

### Option A — Vite, React kept
- Pros: the rewrite is limited to the tooling; the existing components stay readable and act as
  a functional safety net; dependencies declared and locked.
- Cons: no server-side rendering, which the subject does not ask for.

### Option B — Change library (Vue, Svelte)
- Pros: none, at the scale of this project.
- Cons: complete rewrite of the components, for no gain at the assessment and a lost functional
  safety net.

### Option C — Keep in-browser transpilation
- Discarded: it is debt `DET-03`.

## Decision

We choose **option A — Vite, React kept**.

Because:

1. The debt is the tooling, not the library. Changing library would pay for a rewrite on a point
   that is not assessed.
2. The existing components describe the expected behaviour. Keeping them gives a safety net: we
   know what to compare the result with.
3. Vite brings exactly what is missing — build, bundling, locked dependencies, development
   server — without imposing anything else.

## Consequences

**Positive**
- The libraries copied into the repository disappear: 27,315 lines removed by `EN-05`.
- The front end is built into `apps/api/dist/static` and served by the API: a single deliverable
  image (`EN-08`), not two services to deploy.
- The Vitest `jsdom` project covers the front end in the same coverage report as the rest, hence
  a single threshold that can be interpreted.

**Negative / accepted debt**
- Keeping React does not correct the code faults of the legacy front end: `DET-05` (class
  `item false` in the DOM), `DET-06` (`aria-describedby` pointing to a non-existent element,
  field without a `label`) and `DET-07` (`response.ok` never checked) are faults, not tooling,
  and must be corrected explicitly.
- No server-side rendering: the first render waits for the bundle.

**What it imposes on the rest of the project**
- `EN-05` removes the vendored files rather than leaving them next to the new build.
- The visual direction — component library or custom CSS — remains to be decided, and this ADR
  does not decide it.

## How we will know we were wrong

If search engine indexing or the initial render time became a measured requirement, Vite alone
would no longer suffice and server-side rendering would be needed. It is outside the scope of the
subject: this signal is not expected during the project.

## References

- `docs/backlog.md`, decision `D-05`
- `docs/audit-legacy.md`, debts `DET-03` to `DET-07` (`SP-00`, PR #107)
