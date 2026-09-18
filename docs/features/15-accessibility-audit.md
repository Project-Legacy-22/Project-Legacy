# Accessibility audit of the delivered screens

- **Issue**: #15 (`US-14`), audited as #181 (`US-14a`), reported by #193
- **Epic**: A11y
- **Delivered**: 2026-09-10
- **Decisions that apply**: ADR-0014 (WCAG 2.1 AA as the target), ratified 2026-09-11

## What this page is

A measurement of the screens that exist on 2026-09-10, against WCAG 2.1 AA. It records what is
conformant, what is not, and — for each gap — the issue that owns the fix. It is an audit, not a
remediation: nothing here changes behaviour.

The Kanban board and the end-to-end keyboard path were out of scope on that date: the code did
not exist yet. They were measured on 2026-09-13 as #182, and the account screen on 2026-09-18 as
#246; each has its own section at the end of this page.

The table below and the gap list are the only parts that are kept up to date, because a table
that describes a screen as it no longer is misleads faster than no table at all. Each cell that
a later measurement changed says which issue changed it. Everything else is the 2026-09-10 text,
unchanged.

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
| Sign-in details | clean, guarded | walked, guarded | inside `main` | section `h2` |
| Personal data | clean, guarded | walked, guarded | inside `main` | section `h2` |
| Session check / error | not measurable | not applicable | **none** | **none** |
| Kanban board | clean in five states, guarded | walked, guarded | inside `main` | column `h3` |

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

Each entry states where it is, which success criterion it touches, and who owns the fix. None was
fixed on 2026-09-10, the date of the measurement.

Five have been closed since, and each entry below says by whom and when. They are kept rather
than deleted: an audit that erases what it found stops being a record. What is still open is
gap 7, and only its account half -- #246 owns it.

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

**Closed on 2026-09-13 by #247.** Both blocks became named regions where they stand. They were
deliberately *not* moved into `<header class="site-header">`: that block is dark with white text
and the banner writes in grey, so nesting it there would have traded a landmark for a contrast
failure. Held by `landmarks.test.tsx`, which refuses any reachable control outside a landmark and
names the orphan -- verified by putting the banner back as a bare `div`, which reports
`button: Sign out`.

### 4. The session screens have no structure and no way out — `app.tsx:112` and `app.tsx:116`

Both render a bare `<p>`: no landmark, no heading, no styling hook. The error branch offers no
recovery at all — only reloading the page leaves it.

**WCAG 1.3.1 (A)** for the structure, **3.3.3 Error Suggestion (AA)** for the dead end.

**Closed by #49, verified on 2026-09-13.** The screen now renders
`<main class="auth-page session-check" aria-labelledby="session-check-heading">` with an `h1`, and
the error branch carries a `Try again` button wired to a re-check.

### 5. `aria-label` on an element with no role — `items-section.tsx:19`

`<p className="item-count" aria-label={...}>`. `aria-label` is only reliably exposed on elements
carrying a widget or landmark role; on a plain paragraph, support is inconsistent, so the count
may be announced twice or not at all.

**WCAG 4.1.2 Name, Role, Value (A).**

**Closed on 2026-09-13 by #247**, its blocker having merged. The number is shown with
`aria-hidden`, the sentence is read from a visually hidden span: the count is now announced once,
by the content, and no label sits on a role-less element.

### 6. The document level is simulated, never verified

Each `axe` suite sets `document.documentElement.lang` and `document.title` by hand before
running — see `request-reset-form.test.tsx:29-30` and the three others. Without that, every
suite reports `html-has-lang` and `document-title`, which is how this audit first mis-read the
auth screen.

`apps/web/index.html` does carry `lang="en"` and a title, so the served page conforms. But no
test covers it, and the suites are written in a way that would stay green if it stopped.

**WCAG 3.1.1 Language of Page (A)** and **2.4.2 Page Titled (A)**, both satisfied in production
and unguarded.

**Closed on 2026-09-13 by #247.** `landmarks.test.tsx` reads `apps/web/index.html` from disk --
not from `document`, which the suites set themselves -- and refuses the loss of `lang` or of a
title naming the product.

### 7. Two screens are never walked with the keyboard

The task list and the personal data section have an `axe` pass but no keyboard journey. The
harness for it exists since #190.

**WCAG 2.1.1 Keyboard (A)**, **2.4.3 Focus Order (A)** — not shown to fail, not shown to hold.

**Closed on 2026-09-18.** The board half went with #182; the account half is
`account-keyboard-journey.test.tsx`, added by #246 and described in the last section of this
page. Both screens now fail a test when their tab order or their focus handling is lost.

What the walk found on the way is a different gap, and it has its own entry below.

### 8. The three view states are not audited

Loading, empty and error are not reachable as separate states in a test today, so `axe` has
never run on them.

**Closed by #49, verified on 2026-09-13.** `view-state.test.tsx` carries the case « has no
automatically detectable WCAG A or AA violation in any of the three states ».

### 9. The account forms disable the control that holds the focus — found on 2026-09-18

Measured while walking the account screen for #246. Each of the four actions there disables, for
the duration of its call, the control that was just activated: the export button, and the field
and submit button of the email change, the password change and the deletion.

A `disabled` element leaves the tab order, and the focus fixup rule of the HTML standard then
moves focus off it — to the `body`. Re-enabling does not bring focus back. A keyboard user who
changes their password is returned to the top of the document for having done so, and hears
nothing about it.

**WCAG 2.4.3 Focus Order (A).**

The repository had already decided this question elsewhere and for this exact reason:
`items-pagination.tsx` carries `aria-disabled` rather than `disabled`, and
`test/react-root.tsx` records why. The account screen was written without that precedent in
view.

**Half closed by #246**, which applied the same treatment to the export button — the one control
of the four whose disabling protected nothing, since it guards no field. The three forms are
**#368**: a form submits on `Enter` from a field without going through its button, so refusing a
second submission there is a change to the submit handler and not only to an attribute, and
whether the fields become `readOnly` or stay editable is a decision rather than a detail.

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
- **Focus taken away by the document.** jsdom leaves `document.activeElement` on an element that
  becomes `disabled`; a browser applies the focus fixup rule and moves focus to the `body`. An
  assertion on `activeElement` therefore passes here whatever the markup says. Gap 9 is stated
  from the cause — a control leaving the tab order — because the cause is what this rung can
  see.

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
full keyboard path are #182, the account walk is #246, and what that walk found is gap 9,
half closed by #246 and half owned by #368.

## The Kanban half, measured on 2026-09-13 (#182)

The board did not exist when the rest of this page was written. It does now, and so does the
logout that ends the journey, so the two criteria #182 held are measured here.

### The board against WCAG 2.1 AA

`axe-core`, tags `wcag2a` / `wcag2aa` / `wcag21aa`, run on the whole document in **five states**,
because a component passes in one state and fails in another:

| State | Result |
|---|---|
| three columns filled | no violation |
| two columns left empty | no violation |
| the move form open | no violation |
| a move in flight, `aria-busy` set on the column | no violation |
| a move refused by the server | no violation |

Guarded by `apps/web/src/kanban-accessibility.test.tsx`. The empty column is a state of its own
and not the filled one with fewer rows: it replaces the list with a sentence, so it produces a
different tree.

### The tab order

**Left to right, column by column** — the order the columns are read in. An empty column has no
stop of its own, so `Tab` steps over it rather than landing on the sentence that stands in for
the list. Both are guarded.

**Focus survives a move.** The task leaves one column and is remounted in another, so the button
that was focused is destroyed. `useFocusedMove` puts focus back on it. Verified by removing that
line: one test turns red, and only that one. Without it, focus falls back to `body` and a
keyboard user restarts the board from the top.

### The journey, end to end

`apps/web/src/keyboard-journey.test.tsx` walks the path US-14 asks for, screen by screen: sign-in,
registration, sign-in again, the board, a move, and signing out.

Two things it establishes that a single-screen audit cannot:

- **the mode switch does not drop focus.** `auth-page.tsx` gives `AuthForm` a `key={screen}` on
  purpose, so the fields of the previous mode do not linger. A remount is exactly where focus
  gets lost without anyone noticing, because the screen still looks right.
- **registration and sign-in are two steps, not one.** Registering answers the same whether the
  address existed or not, so it cannot be used to find out who has an account — and the person is
  then told to sign in. The journey crosses that boundary with the keyboard alone.

### What this cannot prove, and why it is still enough

jsdom does not turn `Enter` on a focused `<button>` into a click, the way a browser does. So the
journey proves that every control is **reachable** with `Tab`, in the reading order, and that
focus is never dropped — then activates with a click.

That is not a hole. Every control on the path is a native `<button>`, `<input>` or `<select>`, and
those are operated by `Enter` and `Space` by definition. The guarantee comes from the element; what
needed testing is that the element is reachable at all, which is what fails when an action hides
behind a pointer-only gesture or when a remount loses focus.

The drag and drop of `kanban-board.tsx` is one such pointer-only gesture, and it is **not** the
only way to move a task: `move-item-form.tsx` does the same thing with a `<select>` and a submit,
and the form focuses its own select so a keyboard user lands on the control the step is about.
The keyboard alternative US-15 required is therefore not an addition made here — it is the path
the board was built with, and it is now guarded.

### What was still not walked, on that date

`Personal data` remained unwalked with the keyboard, and gap 7 above kept it. The board half of
that gap was closed here; the account half was not, and #246 owned it. It was walked five days
later, and the section below is that measurement.

## The account half, measured on 2026-09-18 (#246)

The section above left the account screen unwalked. `apps/web/src/account-keyboard-journey.test.tsx`
walks it, and this is what the walk established.

### The tab order

Eight stops, in the order the two sections are read:

| # | Stop | Section |
|---|---|---|
| 1 | New email address | Sign-in details |
| 2 | Send confirmation link | Sign-in details |
| 3 | Current password | Sign-in details |
| 4 | New password | Sign-in details |
| 5 | Change password | Sign-in details |
| 6 | Download my data | Your data |
| 7 | Confirm by typing your email address | Your data |
| 8 | Delete my account | Your data |

The order is asserted against a list written out in the test rather than read from the document:
a list derived from the page would agree with the page, including after two fields had been
swapped. Verified by swapping the two password fields — one test turns red, and only that one.

The download comes before the deletion because the section means it to: the deletion warning ends
on "Download your data first if you want to keep it", and a warning that points at a control the
reader has already walked past is advice arriving too late. That intent is an order, so the walk
asserts it.

### The download, the one success that leaves nothing on screen

The file goes to the browser's downloads and the page looks exactly as it did before. Without an
announcement, a screen reader user has no way of knowing the export worked — which is why
`ActionFeedback` renders the confirmation into a visually hidden `aria-live="polite"` region.
Verified by emptying that region: the journey turns red.

### What the walk found

The export button disabled itself while the export ran, which took it out of the tab order — gap
9 above. It now carries `aria-disabled`, like the pagination button, and the journey guards the
property in the form this rung can see: the control is still in `tabbables()` while the export is
in flight, and a second activation does not reach the API. Verified by putting `disabled` back:
two tests turn red.

The same pattern remains in the three account forms and is #368. It is not fixed here because
refusing a second submission on a form is a change to its submit handler — `Enter` in a field
submits without going through the button — and because whether a field should become `readOnly`
or stay editable while a call is in flight is a decision, not an attribute swap.
