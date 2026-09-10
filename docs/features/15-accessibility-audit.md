# Accessibility audit of the delivered screens

- **Issue**: #15 (`US-14`), audited as #181 (`US-14a`), reported by #193
- **Epic**: A11y
- **Delivered**: 2026-09-10
- **Decisions that apply**: `D-15` (WCAG 2.1 AA as the target) — **still unratified**

## What this page is

A measurement of the screens that exist on 2026-09-10, against WCAG 2.1 AA. It records what is
conformant, what is not, and — for each gap — the issue that owns the fix. It is an audit, not a
remediation: nothing here changes behaviour.

The Kanban board and the end-to-end keyboard path are out of scope. They are in #182, which
waits on the code that does not exist yet.

## How it was measured

- **`axe-core` 4.13.0**, tags `wcag2a`, `wcag2aa`, `wcag21aa`, run against the whole document
  after mounting each screen in jsdom.
- **Tab order**, walked with the harness in `apps/web/src/test/react-root.tsx`, which reports
  each stop by its accessible name rather than its tag, so two buttons cannot be confused.
- **Contrast**, computed from the design tokens by `apps/web/src/styles/contrast.test.ts`:
  relative luminance per WCAG, 4.5:1 for text and 3:1 for user interface components.
- **Landmarks and headings**, read from the source, then counted in the mounted document.

Screens without a committed test were measured with a throwaway probe, not kept. Where that is
the case, the table below says so: a measurement that no test repeats is a snapshot, not a
guarantee.

## Screen by screen

| Screen | `axe` | Keyboard path | Landmark | `h1` |
|---|---|---|---|---|
| Sign in / register | clean, **not guarded** | correct, **not guarded** | one `main` | one |
| Forgot password | clean, guarded | walked, guarded | inherits the page | inherits |
| New password | clean, guarded | walked, guarded | one `main` | one |
| Task list | clean, guarded | **not walked** | `header` + `main` | one |
| Personal data | clean, guarded | **not walked** | inside `main` | section `h2` |
| Session check / error | not measurable | not applicable | **none** | **none** |

"Guarded" means a committed test fails if the property is lost. "Clean" without "guarded" means
it holds today and nothing keeps it holding.

## What is conformant, and held by a test

**Every form field has a `label`.** Breaking the `for`/`id` association in `auth-field.tsx` now
turns both the `axe` pass and the keyboard journeys red. Before 2026-09-10 only `axe` caught it,
because the journeys compared one empty string to another.

**`aria-describedby` never points at a node that is not rendered.** A regression test covers
`DET-06`.

**Contrast is verified against the tokens**, text pairs at 4.5:1 and component pairs at 3:1,
each exemption carrying a written reason. No stylesheet may contain a hexadecimal value that is
not a declared token: the guard refuses one, so the palette that is checked is the palette that
is served.

**Focus is not stolen.** The three places that move focus move it onto a heading or a region the
person just asked for.

## Gaps

Each entry states where it is, which success criterion it touches, and who owns the fix. None is
fixed here.

### 1. The entry screen is unguarded — `auth-page.tsx`

`apps/web/src/components/auth-page.tsx` has **no test file**, so no `axe` pass and no keyboard
journey. Probed on 2026-09-10: no detectable violation, one `main`, one `h1`, and a tab order of
email, password, sign in, switch mode, forgot password. It is conformant today.

That is the finding: the screen through which every user enters the application is the only
delivered screen whose conformance nothing defends.

**Owner**: blocked by #174, which restructures this component. Adding a test now would turn
someone else's pull request red. Noted on #174 on 2026-09-10.

### 2. Switching to the reset screen drops focus onto `body`

Measured on a merge of #174 with the keyboard harness: activating "Forgot your password?"
destroys the button that holds focus, and nothing catches it. A keyboard user restarts from the
top of the document; a screen reader user hears nothing about the screen having changed.

**WCAG 2.4.3 Focus Order (A).** Pre-existing; #174 does not introduce it.

**Owner**: offered to #174 on 2026-09-10, otherwise the remediation half of #181.

### 3. The session banner sits outside every landmark — `app.tsx:54`

`<p className="session-banner">` is rendered as a sibling of `<TodoPage>`, so it is in neither
`header` nor `main`. `todo-page.tsx:29-33` says in so many words that its `children` prop exists
to avoid leaving content "outside every landmark and out of reach of a screen reader navigating
by region". The banner is the one thing that escapes it.

**WCAG 1.3.1 Info and Relationships (A)**, and region navigation in practice.

**Owner**: #49 (`EN-48`), blocked.

### 4. The session screens have no structure and no way out — `app.tsx:112` and `app.tsx:116`

Both render a bare `<p>`: no landmark, no heading, no styling hook. The error branch offers no
recovery at all — only reloading the page leaves it.

**WCAG 1.3.1 (A)** for the structure, **3.3.3 Error Suggestion (AA)** for the dead end.

**Owner**: #49 (`EN-48`), blocked.

### 5. `aria-label` on an element with no role — `items-section.tsx:19`

`<p className="item-count" aria-label={...}>`. `aria-label` is only reliably exposed on elements
carrying a widget or landmark role; on a plain paragraph, support is inconsistent, so the count
may be announced twice or not at all.

**WCAG 4.1.2 Name, Role, Value (A).**

**Owner**: blocked by #152, which modifies this file.

### 6. The document level is simulated, never verified

Each `axe` suite sets `document.documentElement.lang` and `document.title` by hand before
running — see `request-reset-form.test.tsx:29-30` and the three others. Without that, every
suite reports `html-has-lang` and `document-title`, which is how this audit first mis-read the
auth screen.

`apps/web/index.html` does carry `lang="en"` and a title, so the served page conforms. But no
test covers it, and the suites are written in a way that would stay green if it stopped.

**WCAG 3.1.1 Language of Page (A)** and **2.4.2 Page Titled (A)**, both satisfied in production
and unguarded.

**Owner**: unowned before this audit. See the issue opened alongside this page.

### 7. Two screens are never walked with the keyboard

The task list and the personal data section have an `axe` pass but no keyboard journey. The
harness for it exists since #190.

**WCAG 2.1.1 Keyboard (A)**, **2.4.3 Focus Order (A)** — not shown to fail, not shown to hold.

**Owner**: the remediation half of #181, blocked by #152 and #176, which modify both screens.

### 8. The three view states are not audited

Loading, empty and error are not reachable as separate states in a test today, so `axe` has
never run on them.

**Owner**: #49 (`EN-48`), which defines them, blocked.

## One finding the issue overstated

#181 lists "no skip link on the authentication screens" among the gaps. **It is not a failure.**

WCAG 2.4.1 Bypass Blocks applies where a block of content repeats across pages. The auth screen
has five tab stops and no repeated navigation block; the session screens have none at all. A
skip link there would be a link to skip nothing. The task list, which does have a repeating
header, carries one at `todo-page.tsx:41`.

What remains is a consistency question, not a conformance one, and it does not deserve an issue.

## What this audit cannot conclude

jsdom is not a browser, and the limits are structural rather than temporary:

- **Computed colour.** `color-contrast` is disabled in every `axe` pass because jsdom resolves
  no cascade. Contrast is covered instead by reading the tokens, which verifies the palette but
  not what a browser finally paints.
- **The focus indicator.** Its visibility is asserted from the token values, not from a rendered
  outline.
- **Real assistive technology.** `axe` finds what is mechanically detectable. It does not say
  whether an announcement is *useful*, and no automated tool does.
- **Leaving the page.** The keyboard simulation wraps from the last element to the first, where
  a browser would move to its own toolbar.

Closing these is the browser rung, #27 (`EN-26`), deliberately deferred — see
`docs/testing-levels.md`.

## The decision that is still open

`D-15` names WCAG 2.1 AA as the target and **has never been ratified**. Every criterion above is
measured against it anyway, since it is the only stated target. Ratifying it, or replacing it,
belongs to the team; until then this report rests on an assumption rather than a commitment.

## How to verify

```
npm run test:dom
```

Contrast, keyboard journeys and the `axe` passes all run there. For a single area:

```
npx vitest run apps/web/src/styles/contrast.test.ts
npx vitest run apps/web/src/components/reset-password-page.test.tsx
```

## Known limits

This page audits; it does not fix. Gaps 3, 4 and 8 belong to #49, gaps 1, 2 and 7 to the
remediation half of #181, gap 5 waits on #152, and gap 6 has its own issue. The Kanban and the
full keyboard path are #182.
