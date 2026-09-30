# Sprint 3 — Retrospective

- **Sprint**: 3, from 17 to 25 September 2026
- **Team**: Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master**: Arthur Guyetand · **Product Owner**: Victor Briez

Prepared on 24 September 2026 from the traces of the sprint ([planning](../plannings/sprint-3.md),
[daily](../dailies/sprint-3.md), [review](../reviews/sprint-3.md), history of the pull requests),
for the retrospective of 25 September. The findings and the actions are to be validated and
completed during the session; the owners proposed below are proposed at one action per member.

## What went well

- Every item classified Must is delivered: the API documentation, the README and the demonstration
  scenario closed the last three on 24 September.
- The Should and Could items committed moved forward together: home screen, search and filters,
  demonstration dataset, reordering within a column, removing a member, keyboard journeys and
  accessibility audits.
- The event flow extended beyond the tasks: adding a member now produces its own notification.
- The feedback of the intermediate defense all received a documented answer.
- Each of the six members has a contribution merged into `dev` during the sprint.

## What got stuck

- The planning remained provisional: three loads not filled in and several issues not estimated at
  the start.
- The user story for sharing a project is not finished; assigning a task, which depends on it,
  could not start.
- Reviews took longer than in the previous sprints, in particular for the stacked pull requests,
  which waited for the one below. Branches opened in parallel collided on shared files, and the
  conflicts were resolved at the end of the sprint.
- On 23 September, merged migrations had not been applied to the hosted database: the task list
  answered 500 on the previews. Fixed the same day, then automated (#385; adjustment #392 in
  review).
- No release to `main` since 15 September: production does not have the features of the sprint
  yet.
- A single daily recorded during the sprint.

## Proposed actions

| Action | Proposed owner | Deadline |
|---|---|---|
| Release `dev` to `main` and check the image, the release and the deployment | Arthur Dos Santos | before the demonstration |
| Decide on project sharing and task assignment: finish or postpone explicitly | Victor Briez | review of 25 September |
| Hold the review and the retrospective of 25 September and record the minutes | Arthur Guyetand | 25 September |
| Make `tk verify` green by fixing the false positive of the trace scan (#371) | Aurélien Pochart | before the demonstration |
| Review the README on a blank machine, as #46 asks | Arthur Gasmi | before the demonstration |
| Rehearse the demonstration, stopwatch in hand, and test the fallback plan | Seïf Soltane | before the demonstration |
