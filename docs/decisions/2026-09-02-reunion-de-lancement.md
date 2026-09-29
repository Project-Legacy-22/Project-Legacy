# Kickoff meeting — 2 September 2026

Goal set: leave the meeting with the decisions that condition the Definition of Ready. As long as
they were not recorded, no development user story could start.

For each point, a reasoned recommendation served as the starting point, to be validated or
rejected. Each structuring decision was then to become an ADR ([docs/adr/](../adr/README.md)).

Meeting rule: decide, note the reason in one sentence, move on; a point that overruns is postponed
with a date.

## Decisions

| # | Subject | Recommendation brought | Decision taken |
|---|---|---|---|
| 1 | Product Owner | a single person, who arbitrates the scope | Victor Briez |
| 1 | Rotation of the Scrum Master | required by the subject | sprint 1: Aurélien Pochart; sprint 2: Arthur Gasmi; sprint 3: Arthur Guyetand |
| 1 | Reviews and daily | sprint deadlines on 4, 11 and 25 September | sprint 1 review on Friday 4 September at 2:30 pm; daily at 4 pm |
| 2 | User scope | single user, sharing as a Would have | **shared projects** |
| 3.1 | Backend typing | strict TypeScript | TypeScript |
| 3.2 | Backend split | by domain, in layers inside | by domain, in layers inside |
| 4.1 | Database | PostgreSQL | **Supabase** (hosted PostgreSQL) |
| 4.2 | Data access | query builder or light ORM, versioned migrations | the Supabase query builder |
| 5 | Front-end build chain | Vite, React kept | Vite, React kept |
| 6 | Event mechanism | in-memory bus with an outbox table | **external broker, Redis** |
| 7 | Sessions and authentication | short access token and revocable refresh token, in an httpOnly cookie | **Supabase** (Supabase Auth) |
| 8 | Quality gate, coverage, image registry | blocking SonarCloud; 70 % on new code; GHCR | no decision recorded during the session |
| 9 | Accessibility, language, visual direction | WCAG 2.1 AA; a single language; library or custom CSS | no decision recorded during the session |

In bold, the points where the decision departs from the recommendation brought. The ADRs of the
repository give the justification.

## Points outside the agenda, decided anyway

| Subject | Decision |
|---|---|
| Notification channel | both: in the application and by email |
| GDPR data controller and contact | Seïf Soltane |
| Data retention periods | indefinitely, unless the user asks and within the GDPR framework |
| Deployment target | Vercel |
| Demonstration scenario and dataset | to be seen later |

## After the meeting

Follow-ups planned during the session:

1. Write one ADR per structuring decision, merged before the item it unblocks starts.
2. Complete `docs/team.md`: roles, rotation, calendar.
3. Refine `.github/CODEOWNERS` with the ownership per module.
4. Enable rotating review assignment across the team.
5. Move the sprint 1 items back to Ready once their decisions are lifted.
6. Take the first issues in the order of the dependencies: EN-03 and EN-04 in parallel, then
   EN-05, EN-09, EN-06.
