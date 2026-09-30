# RGAA audit of the delivered screens

- **Issue**: #436
- **Epic**: A11y
- **Measured**: 2026-09-30
- **Decisions that apply**: ADR-0014 (WCAG 2.1 AA as the target)
- **Builds on**: #15 and `docs/features/15-accessibility-audit.md`

## What this page is

A conformity assessment of the application against RGAA 4.1.2, following the official method,
and the plan that follows from it: each non-conformity has a remediation issue or a justification
the team is asked to validate. It changes no behaviour.

It is not a declaration of conformity. One criterion, 7.1, needs a screen reader to be judged and
is marked as not evaluated; the rates below exclude it and are provisional until it is. Whether the
RGAA is a legal obligation for this service is #435's question, not this page's.

## Reference

- **RGAA 4.1.2**, published on 18 April 2023: `RGAA/criteres.json` of the official repository
  `DISIC/accessibilite.numerique.gouv.fr`, commit `95d5ef3`. 106 criteria in 13 topics.
- **Method**: <https://accessibilite.numerique.gouv.fr/obligations/evaluation-conformite/> for
  the sample and the rates, <https://accessibilite.numerique.gouv.fr/methode/environnement-de-test/>
  for the assistive technologies.

## What was measured

The application at commit `7e5828d`, the head of #446's branch (PR #449): the signed-in screens
in the four views that pull request introduces. On `dev` before it merges, the same components are
stacked in one page; only the navigation and the page titles of the signed-in screens differ, and
the section on non-conformities says where that changes a verdict.

The application ran in a harness that is not committed: the real `App` component, served by Vite,
on the fake APIs of `apps/web/src/test/app-fixture.ts`, so every state is reproducible with the
same data. What differs from production is the network, not the interface.

### Environment

| | |
|---|---|
| Operating system | macOS 15 (Darwin 24.6) |
| Browser | Google Chrome 154.0.8037.92, driven through the DevTools protocol |
| Automated rules | `axe-core` 4.13.0 in the real browser, tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, **contrast rule enabled** |
| Markup validity | W3C Nu validator 26.9.27, confirmed by `html-validate` 9.7.1, on the DOM as rendered |
| Keyboard | every state walked with Tab from the top: order, traps, and focus indicator read from the computed style, then checked on screenshots |
| Reflow | viewport of 320 px (10.11) |
| Text size | root font size at 200 % (10.4) |
| Text spacing | line height 1.5, letter spacing 0.12 em, word spacing 0.16 em, paragraph spacing 2 em (10.12) |
| Assistive technology | **none**. See "Not evaluated" |

### Sample

The method asks for the home, contact, legal notice, accessibility, site map, help and
authentication pages when they exist, one page per service, every page of a process, pages that
look distinct, and a random tenth. The application has an authentication page and a signed-in
home; it has no contact, legal notice, accessibility, site map or help page. It has eight
screens in all, so the sample is every screen and a random draw adds nothing.

| Page | Screen | Address | States walked |
|---|---|---|---|
| P1 | Authentication | `/` signed out | sign in, create an account, request a reset link |
| P2 | Privacy policy | `/?privacy` | page, processors table |
| P3 | New password | recovery link | form |
| P4 | Email change confirmation | email change link | confirmation |
| P5 | Home | `?view=home` | attention groups, notifications panel open |
| P6 | Projects | `?view=projects` | project list, task form, filters, board, move form open, edit form open |
| P7 | Members | `?view=members` | member list, invitation form |
| P8 | Account | `?view=account` | sign-in details, export, account deletion |

Two processes cross pages: recovering an account (P1, then the emailed link to P3) and changing
an address (P8, then the emailed link to P4). Under the method, a criterion is met on a page of a
process only if it is met on every page of it; no verdict below depends on that rule.

## Results

| | C | NC | NA | Not evaluated | Rate |
|---|---|---|---|---|---|
| P1 Authentication | 40 | 1 | 64 | 1 | 97.6 % |
| P2 Privacy policy | 35 | 1 | 69 | 1 | 97.2 % |
| P3 New password | 40 | 1 | 64 | 1 | 97.6 % |
| P4 Email change | 33 | 1 | 71 | 1 | 97.1 % |
| P5 Home | 38 | 1 | 66 | 1 | 97.4 % |
| P6 Projects | 49 | 2 | 54 | 1 | 96.1 % |
| P7 Members | 45 | 1 | 59 | 1 | 97.8 % |
| P8 Account | 45 | 3 | 57 | 1 | 93.8 % |

- **Average rate** (mean of the page rates, as the method defines it): **96.8 %**.
- **Criteria met across the sample** (a criterion counts only if it holds on every page where it
  applies): 49 met, 5 not met, 51 not applicable, 1 not evaluated, so **49 of 54 applicable
  criteria, 90.7 %**. This is the figure a declaration would state.

Both exclude criterion 7.1. The measured state is not WCAG 2.1 AA (ADR-0014): the five
non-conformities below are all WCAG 2.1 A or AA failures, and the objective is met only once they
are fixed or justified and 7.1 is confirmed.

Many criteria are not applicable because the application has no images, frames, media, CAPTCHA,
office documents, new windows, keyboard shortcuts or content that moves. That was checked in the
source of `apps/web/src`, not assumed.

## Non-conformities

| Criterion | Pages | Finding | Owner |
|---|---|---|---|
| 3.2 Text contrast | P8 | The introduction of the sign-in details section uses the header's light text on a white panel: 1.18:1, for 4.5:1 required. Measured by `axe` in the real browser. | #448, fixed by PR #450, not yet merged |
| 8.2 Valid markup | P6 | The count of each Kanban column is a `span` carrying `aria-label`, which HTML forbids on an element without a role. The only three errors of the whole sample, reported by both validators. | #455 |
| 8.6 Relevant page title | P1 to P4 | Every signed-out screen is titled `Todo list \| Legacy 22`. On `dev` before #446 the signed-in screen has that title too. | #454 |
| 9.1 Heading hierarchy | P5 to P8 | The notifications panel is rendered before the header: once open, its `h2` precedes the page's `h1`. | #456 |
| 11.13 Input purpose | P8 | The account deletion confirmation asks for the person's own address with `autocomplete="off"`. | justification below, to validate |

### The one justification the team is asked to validate

The deletion confirmation (`delete-account-form.tsx`) turns `autocomplete` off on purpose: the
person retypes their address to show they mean to delete the account, and a browser that filled
it in would supply the proof of intent the field exists to obtain. The field collects nothing: the
address is compared with the account's and discarded. The proposed justification is that the field
is a confirmation, not an input of the person's data, and that the rest of the page, including
the sign-in details a few lines above it, does declare `email`, `current-password` and
`new-password`.

This is a proposal, not a decision. If the team does not accept it, the fix is one attribute,
and it gives up the property the comment in the component describes.

## Not evaluated: criterion 7.1

7.1 asks that every script-driven component be exposed to assistive technology. Two of its three
tests were checked in the source and hold: every component has a relevant name and role, and its
states are exposed through ARIA (`aria-expanded` on the notifications toggle, `aria-pressed` on
the project list, `aria-current` on the navigation, `aria-invalid` and `aria-describedby` on
fields). The third, 7.1.2, is whether the component *is announced correctly by an assistive
technology*, and that needs one to be run and listened to. It was not.

The method's reference environment includes **VoiceOver (latest version) with Safari** on macOS,
and a component is compatible if it works fully on at least one listed combination. The protocol
to close 7.1, on P1, P5, P6 and P8:

1. Sign in with VoiceOver on (Cmd + F5). Check the error of a wrong password is announced.
2. Open the rotor (VO + U): landmarks list the session banner, notifications, the header, the
   navigation, the main content and the footer; headings start with the page title.
3. Switch views from the navigation. Check each change is announced by its heading.
4. Open the notifications, accept an invitation. Check the answer is announced.
5. In Projects, select a project (its state "selected" is announced), add a task, move it with
   Move then Confirm, move it up and down. Check each result is announced once.
6. In Account, submit the deletion with a wrong address. Check the refusal is announced on the
   field.

Record what VoiceOver says at each step here, and change 7.1 to C or NC accordingly.

## Recommendations

Not non-conformities, and so not blocking. Each is cheap.

- **The skip link is the third stop on the signed-in screens**, after "Sign out" and "Show
  notifications", because the session banner and the notifications panel are rendered before
  it. RGAA 12.7 is met: the link exists, works and is always in the same place. It would be more
  useful first, so it skips those two blocks as well. #456 moves the panel and can move the link
  with it.
- **Date fields and the automated focus check.** The keyboard walk reported the three date fields
  as having no focus indicator: the focus lands on an internal segment of the field before the
  style applies. Checked on screenshots, the indicator is the same double ring as on every other
  field. A future automated check should not take that result at face value.

## What the automated tests cover, and what they do not

The committed suites run in jsdom, which computes no layout and no cascade. They are real guards,
but for part of the RGAA only.

| Criteria | Held by | What it does not see |
|---|---|---|
| 8.3, 8.5 | `landmarks.test.tsx` reads `apps/web/index.html` | The doctype (8.1), and the titles of individual screens (8.6) |
| 9.2, 12.6 | `landmarks.test.tsx`, no control outside a landmark | Heading order (9.1) |
| 11.1, 11.9 | `axe` passes of each screen's suite | Autocomplete purpose (11.13) |
| 3.2, 3.3 | `contrast.test.ts`, on the declared token pairs | A class used on the wrong surface, as #448 showed; `header-scope.test.ts` in PR #450 closes that one |
| 7.3, 12.8, 12.9 | keyboard journeys, `kanban-accessibility.test.tsx`, `view-navigation.test.tsx` | Whether focus is visible (10.7) |
| 10.4, 10.11, 10.12 | nothing | Measured here in the browser only |
| 8.2 | nothing | Measured here with the validators only |
| 7.1 (7.1.2), 7.5 | roles are asserted, never heard | Restitution by an assistive technology |

`axe` itself runs with its contrast rule disabled in every suite, because jsdom has no rendered
colour. That is why #448 was invisible to them and caught at once in the browser.

## If #435 concludes the RGAA is an obligation

The service would then also owe, beyond the fixes above:

- an **accessibility statement** stating the conformity level and the rate, the derogations, the
  non-accessible content and a way to report a problem;
- a **multi-year accessibility plan** and its yearly action plan;
- a mention of the conformity level on the home page and a link to the statement;
- the pages the method expects that do not exist yet: accessibility, and a contact means.

None of these is opened as an issue here, because none is owed until #435 answers. If it answers
yes, each becomes an issue from this list.

## Full grid

C conformant, NC non-conformant, NA not applicable, NT not evaluated. Criterion titles are those of
`criteres.json`; they are not repeated here.

| Criterion | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 |
|---|---|---|---|---|---|---|---|---|
| **1. Images** | | | | | | | | |
| 1.1 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.2 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.3 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.4 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.5 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.6 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.7 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.8 | NA | NA | NA | NA | NA | NA | NA | NA |
| 1.9 | NA | NA | NA | NA | NA | NA | NA | NA |
| **2. Cadres** | | | | | | | | |
| 2.1 | NA | NA | NA | NA | NA | NA | NA | NA |
| 2.2 | NA | NA | NA | NA | NA | NA | NA | NA |
| **3. Couleurs** | | | | | | | | |
| 3.1 | C | C | C | C | C | C | C | C |
| 3.2 | C | C | C | C | C | C | C | NC |
| 3.3 | C | C | C | C | C | C | C | C |
| **4. Multimédia** | | | | | | | | |
| 4.1 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.2 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.3 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.4 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.5 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.6 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.7 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.8 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.9 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.10 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.11 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.12 | NA | NA | NA | NA | NA | NA | NA | NA |
| 4.13 | NA | NA | NA | NA | NA | NA | NA | NA |
| **5. Tableaux** | | | | | | | | |
| 5.1 | NA | NA | NA | NA | NA | NA | NA | NA |
| 5.2 | NA | NA | NA | NA | NA | NA | NA | NA |
| 5.3 | NA | NA | NA | NA | NA | NA | NA | NA |
| 5.4 | NA | NA | NA | NA | NA | NA | NA | NA |
| 5.5 | NA | NA | NA | NA | NA | NA | NA | NA |
| 5.6 | NA | C | NA | NA | NA | NA | NA | NA |
| 5.7 | NA | C | NA | NA | NA | NA | NA | NA |
| 5.8 | NA | NA | NA | NA | NA | NA | NA | NA |
| **6. Liens** | | | | | | | | |
| 6.1 | NA | C | NA | NA | C | C | C | C |
| 6.2 | NA | C | NA | NA | C | C | C | C |
| **7. Scripts** | | | | | | | | |
| 7.1 | NT | NT | NT | NT | NT | NT | NT | NT |
| 7.2 | NA | NA | NA | NA | NA | NA | NA | NA |
| 7.3 | C | C | C | C | C | C | C | C |
| 7.4 | C | C | C | C | C | C | C | C |
| 7.5 | C | NA | C | C | C | C | C | C |
| **8. Éléments obligatoires** | | | | | | | | |
| 8.1 | C | C | C | C | C | C | C | C |
| 8.2 | C | C | C | C | C | NC | C | C |
| 8.3 | C | C | C | C | C | C | C | C |
| 8.4 | C | C | C | C | C | C | C | C |
| 8.5 | C | C | C | C | C | C | C | C |
| 8.6 | NC | NC | NC | NC | C | C | C | C |
| 8.7 | NA | NA | NA | NA | NA | NA | NA | NA |
| 8.8 | NA | NA | NA | NA | NA | NA | NA | NA |
| 8.9 | C | C | C | C | C | C | C | C |
| 8.10 | NA | NA | NA | NA | NA | NA | NA | NA |
| **9. Structuration de l’information** | | | | | | | | |
| 9.1 | C | C | C | C | NC | NC | NC | NC |
| 9.2 | C | C | C | C | C | C | C | C |
| 9.3 | C | C | C | C | C | C | C | C |
| 9.4 | NA | NA | NA | NA | NA | NA | NA | NA |
| **10. Présentation de l’information** | | | | | | | | |
| 10.1 | C | C | C | C | C | C | C | C |
| 10.2 | C | C | C | C | C | C | C | C |
| 10.3 | C | C | C | C | C | C | C | C |
| 10.4 | C | C | C | C | C | C | C | C |
| 10.5 | C | C | C | C | C | C | C | C |
| 10.6 | NA | C | NA | NA | C | C | C | C |
| 10.7 | C | C | C | C | C | C | C | C |
| 10.8 | C | C | C | C | C | C | C | C |
| 10.9 | C | C | C | C | C | C | C | C |
| 10.10 | C | C | C | C | C | C | C | C |
| 10.11 | C | C | C | C | C | C | C | C |
| 10.12 | C | C | C | C | C | C | C | C |
| 10.13 | NA | NA | NA | NA | NA | NA | NA | NA |
| 10.14 | NA | NA | NA | NA | NA | NA | NA | NA |
| **11. Formulaires** | | | | | | | | |
| 11.1 | C | NA | C | NA | NA | C | C | C |
| 11.2 | C | NA | C | NA | NA | C | C | C |
| 11.3 | C | NA | C | NA | NA | C | C | C |
| 11.4 | C | NA | C | NA | NA | C | C | C |
| 11.5 | NA | NA | NA | NA | NA | C | NA | C |
| 11.6 | NA | NA | NA | NA | NA | C | NA | NA |
| 11.7 | NA | NA | NA | NA | NA | C | NA | NA |
| 11.8 | NA | NA | NA | NA | NA | NA | NA | NA |
| 11.9 | C | NA | C | C | NA | C | C | C |
| 11.10 | C | NA | C | NA | NA | C | C | C |
| 11.11 | C | NA | C | NA | NA | C | C | C |
| 11.12 | NA | NA | C | C | NA | C | C | C |
| 11.13 | C | NA | C | NA | NA | NA | NA | NC |
| **12. Navigation** | | | | | | | | |
| 12.1 | NA | NA | NA | NA | NA | NA | NA | NA |
| 12.2 | NA | NA | NA | NA | C | C | C | C |
| 12.3 | NA | NA | NA | NA | NA | NA | NA | NA |
| 12.4 | NA | NA | NA | NA | NA | NA | NA | NA |
| 12.5 | NA | NA | NA | NA | NA | NA | NA | NA |
| 12.6 | C | C | C | C | C | C | C | C |
| 12.7 | NA | NA | NA | NA | C | C | C | C |
| 12.8 | C | C | C | C | C | C | C | C |
| 12.9 | C | C | C | C | C | C | C | C |
| 12.10 | NA | NA | NA | NA | NA | NA | NA | NA |
| 12.11 | C | NA | NA | NA | C | C | NA | NA |
| **13. Consultation** | | | | | | | | |
| 13.1 | NA | NA | NA | NA | C | C | C | C |
| 13.2 | NA | NA | NA | NA | NA | NA | NA | NA |
| 13.3 | NA | NA | NA | NA | NA | NA | NA | NA |
| 13.4 | NA | NA | NA | NA | NA | NA | NA | NA |
| 13.5 | NA | NA | NA | NA | NA | NA | NA | NA |
| 13.6 | NA | NA | NA | NA | NA | NA | NA | NA |
| 13.7 | NA | NA | NA | NA | NA | NA | NA | NA |
| 13.8 | NA | NA | NA | NA | NA | NA | NA | NA |
| 13.9 | C | C | C | C | C | C | C | C |
| 13.10 | NA | NA | NA | NA | NA | C | NA | NA |
| 13.11 | C | C | C | C | C | C | C | C |
| 13.12 | NA | NA | NA | NA | NA | NA | NA | NA |
