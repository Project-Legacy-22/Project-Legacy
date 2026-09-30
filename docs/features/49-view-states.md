# Consistent loading, empty and error states

- **Issue**: #49
- **Epic**: A11y
- **Delivered**: 2026-09-11
- **Decisions that apply**: ADR-0006 (Vite and React), ADR-0011 (English for the code)

## What it does

The four views of the application go through the same three states -- loading, without data,
failed -- and now render them the same way. A person who cannot see the screen hears the same thing
on all four; a person who runs into a failure always finds a way to try again there; an empty state
says what is missing and, when possible, offers the action that fills it.

Out of scope: the result of an action (success or failure of a form submission), which is another
subject and remains carried by `action-feedback.tsx` and `form-outcome.tsx`. This issue is about
the state of a view, not the report of an action.

## What existed before

Seven improvised renderings for three states, and no agreement between them.

| View | Loading | Empty | Failure |
|---|---|---|---|
| Tasks | `role="status"` line | line of text, no action | panel with retry |
| Projects | `role="status"` line | line of text, no action | panel with retry |
| Notifications | `role="status"` line | line of text, no action | panel **with no way out** |
| Session check | `<p role="status">` **outside any landmark** | not applicable | `<p role="alert">`, **with no way out** |

The two cases without a way out are the ones that matter. The notification panel in failure could
only be restarted by closing and reopening it, which nothing indicated. The session check screen in
failure only left a page reload, and it is the least visible of the four: it only appears when the
API is unreachable, that is precisely when somebody needs to be told what to do.

## Surface

| Screen | State carried by |
|---|---|
| Task list | `components/items-content.tsx` |
| Projects panel | `components/projects-section.tsx` |
| Notifications panel | `components/notifications-panel-content.tsx` |
| Session check | `components/session-check-screen.tsx` |

The shared component is `components/view-state.tsx`. It renders a fragment and not a container: the
state of a view belongs to the region that contains it, and each caller carries `aria-busy` on its
own `<section>`. A single carrier, on the element a screen reader already announces -- putting it
on the line of text would say that the text is busy, not that the panel is.

## The four cases, and why

| State | What is rendered | Reason |
|---|---|---|
| loading, nothing yet | the line alone | announcing an empty state while the response is on its way would say there is nothing, which is not known yet |
| loading, data already there | the line and the data | a refresh must not empty what somebody is reading |
| ready, nothing | the empty state, with the action that fills it | an empty state with no way out is one of the two defects the issue names |
| ready, data | the data | |

One named exception: `keepsChildrenWhenEmpty`. The Kanban board keeps its three columns when it
carries no task, because the columns are the workflow and not the data, and each column says for
itself that it is empty. A list, on the other hand, disappears: rendering an empty `<ul>` next to
the message would say it twice.

## The action that fills an empty state

The type requires it, through a union: a view offers either an `action`, or a reason written in
`unfillable`. Leaving the action out is not possible, which prevents an oversight from passing for a
choice.

| View | Action | Reason when there is none |
|---|---|---|
| Tasks | "Add item", which places the cursor in `#item-name` | |
| Projects | "Create project", which places the cursor in `#project-name` | |
| Notifications | none | the list only fills when somebody acts on a task: nothing on this screen fills it |

The action sets the focus in the field, it does not scroll to it: somebody who cannot see the panel
receives the cursor where the task is written.

## Accessibility

Loading is announced through `role="status"`, a polite live region: it announces without
interrupting and does not take the focus. Failure is announced through `role="alert"`, because it
interrupts what the person had asked for and they have a decision to take.

The focus only moves in one place, and on a deliberate action: after a click on "Try again" in the
task list, the button disappears with the panel, so the focus is set on the heading of the region
that was just requested again. No state change moves the focus by itself.

`prefers-reduced-motion` is already respected globally: `styles/foundation.css` brings every
transition duration down to 0.01 ms under this preference, and `styles/motion.test.ts` checks it. No
animation was added here.

The session check screen is now a `<main>` with an `<h1>` and the `main-content` `id` that the skip
links of the other pages target. It reuses the centred column of `.auth-page` rather than a rule
almost identical to it.

## Personal data

None. The failure messages are the ones the `api/` modules wrote; the component adds nothing to
them -- no status code, no stack, no request identifier -- and a test checks it.

## How to check

```
npm run typecheck && npm run lint && npm test
```

- `components/view-state.test.tsx`: the four cases, the action that fills, the justified absence of
  an action, the retry called, the absence of technical detail, and `axe` on the three states.
- `components/projects-section.test.tsx`, `components/todo-page.test.tsx`,
  `app-notifications-panel.test.tsx`: `aria-busy` exposed on the region and removed when the view is
  ready. Nothing checked it before, on any of the three.
- `app-notifications-panel.test.tsx` and `app.test.tsx`: the retry **runs the request again**, and
  does not only display a button. Both count the calls to the fake.

## Known limits

The action report remains separate: `action-feedback.tsx` and `form-outcome.tsx` say what became of
a form submission, which is not the state of a view. Unifying them is another subject.

The personal data section has no loading state: it displays no list, only two actions. There was
therefore nothing to migrate.
