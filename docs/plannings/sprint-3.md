# Sprint 3 — Planning

- **Date**: Thursday 17 September 2026
- **Sprint**: 3, due on Friday 25 September 2026
- **Present**: Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master**: Arthur Guyetand

## Review of the previous sprint

Every issue planned for the previous sprint was finished.

Bugs were however discovered during integration and testing. They must be qualified and
prioritised before being added to sprint 3, so as not to silently replace the goals already
committed.

## Goal

Finalise the collaborative uses around projects and tasks, improve the use of the application on
the different screens and prepare a reliable demonstration with reproducible data.

## Issues selected

### Victor Briez — 15 points estimated

| Issue | Title | Points | State at planning |
|---|---|---|---|
| #44 | EN-43 - Demonstration dataset | 2 | Ready |
| #21 | US-20 - Personalised home screen | 5 | Ready |
| #33 | US-32 - Search and filter my tasks | 3 | Ready |
| #34 | US-33 - Sharing a project between users | 5 | Ready |

### Arthur Guyetand — 8 points estimated, two sub-issues to estimate

| Issue | Title | Points | State at planning |
|---|---|---|---|
| #348 | US-58 - Assign a task to a member of the project | 5 | Ready |
| #351 | Members screen of a project, sub-issue of US-33 | to estimate | Ready |
| #354 | Remove a member from a project, sub-issue of US-33 | to estimate | Ready |
| #50 | US-49 - Reorder a task within a column | 3 | Backlog |

### Arthur Gasmi — 3 points estimated, two issues to estimate

| Issue | Title | Points | State at planning |
|---|---|---|---|
| #246 | Keyboard journeys on the screens delivered before the Kanban | to estimate | Ready |
| #352 | Declare the disclosure of addresses between members, sub-issue of US-33 | to estimate | Ready |
| #42 | US-41 - Interface usable on a small screen | 3 | Backlog |

## Sprint load

Total estimated at planning: 26 points, including the 5 points of US-33.

The sub-issues #351, #352 and #354 are not added a second time if their estimates only serve to
distribute the 5 points of US-33. Issue #246 is independent: its points are added to the total
after it is estimated.

## Dependencies

- US-58 depends on US-33: assigning a task can only be finalised when the management of the members
  of the project is available.
- #351, #352 and #354 are sub-issues of US-33, to be coordinated with the implementation carried by
  Victor Briez.
- US-49 depends on the existing Kanban.
- US-41 depends on the accessibility foundation.

## Risks identified

- The load of three members of the team is not filled in yet.
- #246, #351, #352 and #354 are not estimated, and the completion criteria of #351, #352 and #354
  remain to be defined.
- US-41 and US-49 are assigned but still in the Backlog status.
- A delay on project sharing will block the assignment of tasks.
- US-32 and US-49 are classified Could: first candidates for removal if the real capacity is
  insufficient.
- The bugs discovered during the previous sprint can reduce the capacity of the sprint.

## Decisions

- The main goal is collaboration around projects and tasks, and the preparation of a stable
  demonstration.
- US-33 is split between several members; Victor Briez keeps the coordination of the parent user
  story.
- US-58 only starts once the necessary parts of US-33 are available.
- Each member keeps only one issue in progress at a time.
- An issue only starts after its acceptance criteria, its estimate and its dependencies are
  validated.
- The Could items are the first candidates for removal if the sprint is overloaded.
- A bug discovered during the sprint is created and classified separately; it only replaces a
  committed issue after an explicit decision of the team.

## Validation

The planning remains provisional as long as the three missing assignments, the estimates and the
completion criteria are not filled in.
