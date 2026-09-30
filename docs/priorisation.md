# Prioritisation: where the "Must" items stand

The record of the intermediate defense asks to check that the features classified "Must" remain the
priority, and in particular "that a secondary criterion related to deployment does not come before
a need classified Must".

This document crosses the classification of the backlog with the real state of the issues.
Measurement of 15 September 2026, reproducible: the classification comes from `backlog-v2.md`, the
state from `gh issue list`.

**Update of 24 September 2026: the 25 Must items are delivered.** The three end-of-project Enablers
that the measurement below left open were closed that day: the API documentation (#45, PR #389),
the README (#46, PR #390) and the demonstration scenario (#47, PR #391). Complete continuous
deployment, classified Could, has still not been started. The rest of the document keeps the
measurement of 15 September.

**Update of 30 September 2026: 26 Must items, all delivered.** Checking the backlog against section
6.1 of the subject found a gap no item carried: projects could be created, listed and deleted, but
not updated. US-60, "Rename a project", was added as a Must item (#461) and delivered by #464 and
#465. The final state of the whole scope, Could items included, is in section 6 of
[backlog.md](backlog.md).

## The classification, in figures

48 items classified: **25 Must**, 16 Should, 7 Could.

## The 25 "Must" items

Twenty-one are delivered and their issue is closed:

| Code | Item | Issue |
|---|---|---|
| SP-00 | Audit of the legacy and inventory of the debt | #1 |
| SP-01 | ADRs of the stack and of the target architecture | #2 |
| EN-02 | Git conventions, protection of `main`, templates | #3 |
| EN-24 | Board, backlog and agile traces kept up to date | #25 |
| EN-03 | Complete environment started with one command | #4 |
| EN-30 | Configuration through environment variables | #31 |
| EN-04 | Backend restructured in layers and typed | #5 |
| EN-05 | Front-end build chain and accessibility foundation | #6 |
| EN-09 | Data model and versioned migrations | #10 |
| EN-06 | Tests and lint runnable locally | #7 |
| EN-07 | Continuous integration on every pull request | #8 |
| EN-08 | Docker image published on every merge into `main` | #9 |
| US-10 | Event-driven workflow demonstrable end to end | #11 |
| US-11 | Create an account and sign in | #12 |
| US-12 | Create and view my tasks | #13 |
| US-31 | Edit, complete and delete a task | #32 |
| US-16 | Group my tasks by project | #17 |
| US-15 | Move a task between the columns of the Kanban | #16 |
| US-47 | Sign out | #48 |
| US-36 | Change my email and my password | #37 |
| US-37 | Privacy policy and consent | #38 |
| US-13 | Export and delete my personal data | #14 |

No User Story classified "Must" is open. **The three that remain are end-of-project Enablers**, and
their purpose is precisely to come last:

| Code | Item | Issue | Why open |
|---|---|---|---|
| EN-44 | Published API documentation | #45 | describes an API that kept moving until sprint 3 |
| EN-45 | Complete README and onboarding journey | #46 | describes a repository that kept moving until sprint 3 |
| EN-46 | Preparation of the final demonstration | #47 | the final demonstration has not taken place |

A fourth point deserves to be named so as not to be counted twice: **#269** is open and carries the
code `US-36`, but the story itself (#37) is delivered. #269 is a consistency debt — integrating
US-36 into the interface patterns that arrived since — and not the need.

## The deployment question, in figures

It is the explicit concern of the teacher. The classification answers it:

| Code | Item | MoSCoW | State |
|---|---|---|---|
| EN-08 | Docker image published on every merge into `main` | **Must** | closed, but see below |
| EN-42 | Observability: health check and structured logs | Should | open (#43) |
| EN-22 | **Complete continuous deployment** | **Could** | open (#23), not started |

The only deployment work delivered is **EN-08, itself classified Must**. "Complete continuous
deployment" is classified **Could**, is worth 8 points, and has not been started: it has therefore
not come before anything.

No Should or Could item was delivered at the expense of a Must, and this can be checked otherwise
than by a claim: every Must except the three terminal Enablers was closed on 15 September, and those
three have been closed since the 24th.

### An exception to own, and it does not go in the feared direction

Monitoring — Prometheus as the format, Grafana Cloud as the platform, ADR-0016 — **is not a backlog
item**. It was done because the intermediate defense explicitly asked for it (action 7: "Choose a
monitoring platform and write the corresponding ADR"). It therefore reads as an answer to the
review, not as a priority the team would have given itself instead of a need.

It must be owned as such: time was spent outside the backlog, at the request of the client.

## The real defect found by this check

It is not the one we were looking for, and it is more troublesome.

**EN-08 is a closed Must whose effect has disappeared.** The Docker image and the release date from
3 September. The `image` workflow failed on the push of 11 September, at the SonarCloud step, and
the publication step was skipped. Nobody saw it, because the issue was closed and the board green.

The cause, the detail and what unblocks it are in **#315**. The point to remember here is one of
method: **a green board does not prove that an artefact exists.** A closed issue says that a piece
of work was done once, not that it still produces its effect.

It is the only real priority inversion of this project, and it goes the other way from what the
review feared: it is not a secondary criterion that took the place of a Must, it is a Must that
stopped working without a sound.

## How to redo this measurement

```bash
# the classification, in the backlog of the team
grep -E "\| (Must|Should|Could)" backlog-v2.md

# the state
gh issue list --state all --limit 400 --json number,title,state
```

Cross them on the code (`US-11`, `EN-08`) present in the issue titles. The table above is the result
of that crossing, not a reading by eye.
