# Signed-in views and navigation

- **Issue**: #446, part of #428, with the session card of #456
- **Epic**: A11y
- **Decisions that apply**: ADR-0006, ADR-0014

## What it does

The signed-in application shows one view at a time instead of stacking every section in a
single page: **Home** (what needs attention), **Projects** (projects, tasks and the Kanban),
**Members** (who is in the selected project) and **Account** (credentials, export and
deletion). A navigation in the header moves between them. Home comes first after signing in.

Each view has its own address, `?view=<name>`, so a reload, a bookmark or a shared link opens
the same view, and the browser's Back button returns to the previous one. An address that
names no known view opens Home.

The session card, which holds the signed-in address, the unread count and the notifications,
is rendered after the header (#456). The page title is therefore the first heading and the skip
link the first tab stop.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `?view=home` | What needs attention across the projects | session required |
| `?view=projects` | Project list, task form, task list and Kanban | session required |
| `?view=members` | Members of the selected project, or a link to Projects when none is selected | session required |
| `?view=account` | Email, password, export and account deletion | session required |

No API change: the views read the same endpoints as before.

## Accessibility

- The navigation is a `nav` landmark named "Sections", made of links, not buttons: each view
  has an address, can be opened in a new tab, and is listed among the links of the page.
  `aria-current="page"` marks the open view. A modified click (new tab, new window) is left to
  the browser.
- Changing view moves the focus to the heading of the new view, which is how the change is
  announced; no live region repeats it. The first load keeps the focus at the top of the page.
- The tab title names the view, as `<View> | Todo list | Legacy 22`, so history and the window
  list tell the views apart (RGAA 8.6).
- The skip link still jumps to the main landmark, which holds only the current view.
- Each view passes the `axe` WCAG 2.1 A and AA rules supported by jsdom.

## Personal data

None added. The signed-in address shown in the session card was already displayed.

## How to verify

```
npm test
npm run dev
```

`apps/web/src/view-navigation.test.tsx` covers the first view, the address kept across a
reload, an unknown address, the Back button, the empty states and an `axe` pass per view.
`apps/web/src/landmarks.test.tsx` covers the order of the page title, the skip link and the
session card. Screens: `docs/screenshots/446-home.jpg`, `446-projects.jpg`,
`446-members.jpg` and `446-account.jpg`.

## Known limits

- The notifications stay in the session card rather than becoming a view of their own; their
  grouping with the session actions in the header is #440.
