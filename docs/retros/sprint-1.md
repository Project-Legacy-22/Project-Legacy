# Sprint 1 — Retrospective

- **Sprint**: 1, from 1 to 4 September 2026
- **Team**: Arthur Dos Santos, Arthur Gasmi, Arthur Guyetand, Aurélien Pochart, Seïf Soltane, Victor Briez
- **Scrum Master**: Aurélien Pochart · **Product Owner**: Victor Briez

No retrospective was recorded during the session. This one was written on 24 September 2026 from
the traces of the sprint: [planning](../plannings/sprint-1.md), [daily](../dailies/sprint-1.md),
[review](../reviews/sprint-1.md), [kickoff meeting](../decisions/2026-09-02-reunion-de-lancement.md)
and the history of the pull requests. It is to be reviewed and completed by the team.

## What went well

- Every planned issue was finished, and each of the six members delivered their share from this
  first sprint on.
- The foundations were laid early, as the subject asks: layered architecture, Vite front end,
  versioned database, continuous integration, quality gate, authentication and first event flow.
- The kickoff meeting settled the structuring decisions in one session; they became ADRs.
- Short ceremonies: ten to fifteen minutes per daily.

## What got stuck

- The technologies were only settled on 2 September: the sprint only really started on the 3rd.
- Dependency chains: authentication waited for the database, the tasks waited for authentication.
  Several people waited at the same time for the same item.
- The school repository allowed neither requiring pull requests nor protecting `main`: we had to
  work on a mirror repository.
- 34 pull requests merged from the first sprint: a sustained pace, which review had to keep up
  with.
- Two points of the kickoff meeting, quality and the interface, remained without a recorded
  decision.

## Actions, and what became of them

| Action | Observed follow-up |
|---|---|
| Split user stories into API then interface sub-issues | adopted at the sprint 2 planning, which applied it systematically |
| Settle the points left open | ADR-0009 (SonarCloud), ADR-0011 (language), ADR-0014 (WCAG 2.1 AA), ADR-0015 (GHCR) |
| Require an approval before merging into `dev` | branch protection in place: an approval and the SonarCloud check required |
