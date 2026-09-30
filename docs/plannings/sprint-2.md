# Sprint 2 — Planning

- **Date**: Monday 7 September 2026
- **Sprint**: 2, from 7 to 11 September 2026
- **Present**: Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master**: Arthur Gasmi · **Product Owner**: Victor Briez

## Review of the previous sprint

- Points completed against points planned: every planned issue was done.
- Not finished: nothing.

## Goal

Deliver the functional core of the Kanban: complete management of a task, grouping by project,
moving between columns, and the account journey beyond simple sign-in.

## User stories selected

| ID | User story | Points | Assigned to |
|---|---|---|---|
| US-31 | Edit, complete and delete a task | 3 | Arthur Guyetand |
| US-16 | Group my tasks by project | 5 | to be assigned |
| US-15 | Move a task between the columns of the Kanban | 8 | Arthur Guyetand |
| US-47 | Sign out | 2 | Aurélien Pochart |
| US-36 | Change my email and my password | 3 | Victor Briez |
| US-37 | Privacy policy and consent | 3 | to be assigned |
| US-13 | Export and delete my personal data | 5 | Arthur Gasmi |
| US-27 | Persistent session and clean expiry | 3 | Arthur Gasmi |
| US-19 | Priority and due date on a task | 3 | Arthur Guyetand |
| US-18 | Be notified of the events that concern me | 5 | Aurélien Pochart |
| US-28 | Reset my forgotten password | 5 | Victor Briez |
| US-14 | Accessibility compliance and remediation | 5 | to be assigned |
| EN-48 | Consistent loading, empty and error states | 3 | to be assigned |
| EN-29 | Security hardening of the API | 3 | Victor Briez |
| EN-25 | API integration tests, authorization included | 5 | Aurélien Pochart |
| EN-38 | Register of processing activities and minimisation | 2 | to be assigned |

Total points committed: 63 backlog points. The 29 Must points (US-31, US-16, US-15, US-47, US-36,
US-37, US-13) are the floor: they come before any Should.

## Risks identified

- US-15 is worth 8 points and is blocked by US-16, which has no owner yet.
- Five items of the sprint still have no assignee, two of them Must.
- Two Dependabot pull requests pending.

## Decisions

- The sprint commits to the 16 Ready items of the sprint 2 backlog, in the order of the table, Must
  first.
- The five items without an assignee are distributed at an upcoming daily, according to overall
  progress.
- Systematic split into API then interface sub-issues, as on US-11 and US-12 in sprint 1: the
  format worked well and keeps pull requests under 400 lines.
- Rhythm unchanged, but the daily moves to 2:30 pm. Sprint review on Friday 11 September at
  2:30 pm.
