# Usable on a small screen

- **Issue**: #42 (US-41)
- **Epic**: A11y
- **Delivered**: 2026-09-24
- **Decisions that apply**: ADR-0014

## What it does

Every delivered screen works on a phone: nothing scrolls sideways at 320, 360 or 768 px wide,
no form field is small enough for a mobile browser to zoom into it, and every control can be
hit with a finger without touching its neighbour. The Kanban reads one column after another
below 960 px, and a task still moves through its Move button and destination list, which
need no drag.

Nothing is hidden on a narrow screen. The only elements hidden at any width are the skip link
until it takes focus and the `.visually-hidden` text meant for assistive technology.

## Surface

| Screen | What changed |
|---|---|
| Signed-in page, add form | Stacks into one column below 760 px. It used to keep three columns and push the page to 595 px at 320 px wide |
| Signed-in page, filters | The "No due date" checkbox and its label form a 44 px target, clear of the date field above |
| Sign-up screen, consent | The consent label is at least 44 px tall, so its target no longer overlaps the policy link below |

Measured and unchanged: sign-in, forgot password, reset password, privacy policy, the edit and
move forms of a task card, the home section, projects, members and account sections.

## Why the add form overflowed

Its narrow layout was declared in the 620 px block of `layout.css`. `controls.css`, imported
after it in `styles.css`, set `grid-template-columns` on `.add-form` outside any media query.
Both selectors have the same specificity, so the later rule won at every width and the
narrow layout never applied.

`src/styles/cascade.test.ts` now reads the sheets in the order `styles.css` imports them, and
fails when a rule outside a media query overrides a media rule on the same selector and
property. On the previous sheets it reports this case and a second dead rule on `.todo-item`.

The form gets its own breakpoint, 760 px, above the 620 px of the other grids: its two
minimum widths, the button and the gaps need about 600 px inside the panel, which the page
only provides from about 710 px wide.

## Accessibility

- Targets: 44 by 44 CSS px, spacing included. A smaller target passes only when a 44 px
  square centred on it touches no other target. Links inside a sentence are exempt, as in
  WCAG 2.5.8.
- Form text: inputs and selects inherit 16 px from the page, the size under which iOS Safari
  zooms into a focused field.
- Zoom: 200 % on a 1280 px window lays out at 640 CSS px, and on a 1024 px window at 512 CSS
  px. Both were measured with no content cut and no action out of reach.

## How to verify

The check needs a real browser: jsdom computes no layout. EN-26 (#27) has not delivered its
browser suite yet, so the verification is recorded as dated screenshots, as the issue allows.

Screenshots of 2026-09-24, Chrome 152 headless, local stack with the demo data
(`npm run db:reset`, signed in as `camille.demo@example.com`), in
[`42-small-screens/`](42-small-screens/):

| Screen | 320 px | 360 px | 768 px |
|---|---|---|---|
| Sign in | [320](42-small-screens/sign-in-320.webp) | [360](42-small-screens/sign-in-360.webp) | [768](42-small-screens/sign-in-768.webp) |
| Create an account | [320](42-small-screens/register-320.webp) | [360](42-small-screens/register-360.webp) | [768](42-small-screens/register-768.webp) |
| Forgot password | [320](42-small-screens/forgot-password-320.webp) | [360](42-small-screens/forgot-password-360.webp) | [768](42-small-screens/forgot-password-768.webp) |
| Reset password | [320](42-small-screens/reset-password-320.webp) | [360](42-small-screens/reset-password-360.webp) | [768](42-small-screens/reset-password-768.webp) |
| Privacy policy | [320](42-small-screens/privacy-policy-320.webp) | [360](42-small-screens/privacy-policy-360.webp) | [768](42-small-screens/privacy-policy-768.webp) |
| Signed in, whole page | [320](42-small-screens/signed-in-320.webp) | [360](42-small-screens/signed-in-360.webp) | [768](42-small-screens/signed-in-768.webp) |
| Task card being edited | [320](42-small-screens/task-edit-320.webp) | [360](42-small-screens/task-edit-360.webp) | [768](42-small-screens/task-edit-768.webp) |
| Task card being moved | [320](42-small-screens/task-move-320.webp) | [360](42-small-screens/task-move-360.webp) | [768](42-small-screens/task-move-768.webp) |

Each of these eight screens was also measured at 621, 700, 761 and 961 px and at the two 200 %
zoom widths: no element wider than the page or than its panel, no target under 44 px that
touches another, no form field under 16 px.

```
npx vitest run apps/web/src/styles/cascade.test.ts
```

## Known limits

- The screenshots are a record, not a guard: a later change can break a width without any
  test failing. The browser suite of EN-26 (#27) is where these measurements belong.
- Drag and drop was not tested on a touch screen. The path verified on a phone is the Move
  button, the keyboard path the Kanban already had.
