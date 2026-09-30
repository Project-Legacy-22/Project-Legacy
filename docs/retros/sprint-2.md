# Sprint 2 — Retrospective

- **Sprint**: 2, from 7 to 11 September 2026
- **Team**: Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master**: Arthur Gasmi · **Product Owner**: Victor Briez

No retrospective was recorded during the session. This one was written on 24 September 2026 from
the traces of the sprint: [planning](../plannings/sprint-2.md), [dailies](../dailies/sprint-2.md),
[review](../reviews/sprint-2.md) and the history of the pull requests. It is to be reviewed and
completed by the team.

## What went well

- The 16 items committed, 63 points, were all delivered, Must first as decided at the planning.
- Each of the six members carried user stories of the functional core: tasks, projects, Kanban,
  account, notifications, personal data, accessibility, security.
- The split into sub-issues kept pull requests under 400 lines, hence reviewable.
- The Product Owner judged that the plan was respected and the deadlines met.

## What got stuck

- Five items without an owner at the planning, two of them Must: they were distributed during the
  sprint.
- Reviews and merges became the bottleneck: at the daily of 10 September, half of the team was
  waiting for a merge or a review, and conflicts appeared on the shared files.
- Many simultaneous pull requests: 64 merged over the week.
- 20 bugs discovered during the sprint: all fixed, but as much work not planned at the planning.
- Production still served the code of 11 September; the event relay did not run there until the
  next release was done.

## Actions, and what became of them

| Action | Observed follow-up |
|---|---|
| Classify a discovered bug separately, without silently replacing a commitment | decided at the sprint 3 planning |
| Release to `main` regularly | release of 15 September; the relay has been running in production since |
| Answer the points of attention of the intermediate defense | ADR-0016 and ADR-0017, backup and restore tested, data migration in both directions; see the [defense review](../reviews/soutenance-intermediaire.md) |
