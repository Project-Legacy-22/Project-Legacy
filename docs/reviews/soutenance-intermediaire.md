# Intermediate defense — feedback of the teacher

Record of the first intermediate defense, held between sprints 2 and 3 (date not noted in the
record).

## Organisation of the team

The important roles of the project must be clearly presented:

- the Product Owner;
- the Scrum Master of each sprint;
- the responsibilities of the development team.

The presentation must also explain concretely how the team works and how the responsibilities are
distributed.

## Working method

The team uses Scrum, with iterative sprints. The work is organised around:

- a Sprint Planning;
- user stories grouped in a backlog;
- daily meetings to follow progress and identify blockers;
- work branches associated with the issues;
- pull requests reviewed by another member before they are integrated.

## GitHub Actions

The next presentation must show the GitHub Actions of the project and explain:

- the checks run automatically;
- the tests run;
- the quality checks;
- the deployment process;
- the conditions required before a pull request is integrated.

## Architecture decisions

The ADRs must be presented to justify the technical choices: the main alternatives studied, the
decision taken, its advantages and its limits.

## Points of attention about Supabase

### Hosting and data sovereignty

The hosting offered by Supabase can place the data on servers located abroad. This raises questions
about the real location of the data, access permissions, compliance with data protection
requirements, and the dependency on a non-sovereign provider. This choice must be owned and clearly
documented.

### Durability of the data

A free plan presents a risk for keeping the data over several years. The team must check and
document:

- the guaranteed retention period;
- the consequences of a pause or a deletion of the Supabase project;
- the backup procedure;
- the data recovery procedure;
- the method to change provider without losing the users' data.

Abandoning the users' data in case of a problem with Supabase is not acceptable.

### Data migration

The project being a takeover of a legacy application, the main goal remains to evolve the system
without breaking what already works. A clear procedure must explain how to migrate the data from
MySQL or SQLite to PostgreSQL and Supabase; the migration must be reproducible and as transparent as
possible for the users.

To limit the dependency on Supabase, the changes to the database must be described by versioned
migrations. A replacement solution must be able to rebuild the schema and recover the data.

## Prioritisation

The team must check that a secondary criterion related to deployment does not come before a need
classified Must. If a compromise is needed, the decision must be owned, explained and documented.

## Monitoring

A monitoring platform must be chosen before the end of the project, and be the subject of an ADR
presenting the monitoring needs, the solutions compared, the solution chosen, the data collected,
the costs and the limits, and the impacts on security and personal data.

## Actions for what comes next

1. Clarify the roles in the presentation and in the documentation.
2. Present how the GitHub Actions work.
3. Show the most important ADRs.
4. Document the limits of Supabase and the risk of non-sovereign hosting.
5. Define a procedure for backup, restore and migration of the data.
6. Prepare a strategy to change database or provider.
7. Choose a monitoring platform and write the corresponding ADR.
8. Check that the Must features remain the priority.

## Follow-up

State as of 24 September 2026. Each action points to the document that answers it; what remains
open is said as such.

| # | Action requested | Answer | What remains |
|---|---|---|---|
| 1 | Clarify the roles | [docs/team.md](../team.md): Product Owner, Scrum Master of each sprint, GDPR contact, how the team works | — |
| 2 | Present the GitHub Actions | [docs/ci.md](../ci.md): the seven workflows, the nine checks of `ci`, what blocks an integration, the path of a change up to deployment | to show in the demonstration, steps 5 to 7 of [docs/demo.md](../demo.md) |
| 3 | Show the important ADRs | [docs/adr/](../adr/README.md): 20 ADRs, each with its alternatives, its decision and its consequences | to show in the demonstration, step 9 |
| 4 | Document the limits of Supabase and the non-sovereign risk | ADR-0017: region `eu-west-1` (Ireland), American company and infrastructure subject to the CLOUD Act, no retention commitment on the free plan; [GDPR register](../gdpr/registre.md): each processor, its region, what it holds | — |
| 5 | Procedure for backup, restore and migration of the data | [docs/backup-and-exit.md](../backup-and-exit.md): backup with `npm run backup`, restore tested on 12 September, accounts signed in again with their original password; [docs/data-migration.md](../data-migration.md): import from MySQL or SQLite, replayable; ADR-0018: the choice of a tool that writes reviewed scripts, in both directions, and its alternatives; ADR-0019: the automatic application of the migrations to the hosted database | applying `schema.sql` to a truly new project was not tested, for lack of a second project; the risk is written in the document |
| 6 | Strategy to change database or provider | [docs/backup-and-exit.md](../backup-and-exit.md), section "Leaving": schema and data secured, tested on three engines by `npm run test:migration`; what would have to be rewritten is named (authentication, row policies, PostgREST) | — |
| 7 | Choose a monitoring platform, with an ADR | ADR-0016: needs, solutions compared, Prometheus and Grafana Cloud in Germany, data collected, costs, limits, impact on personal data; dashboard "Legacy 22 — flux et service" in service | — |
| 8 | Keep the Must items first | [docs/priorisation.md](../priorisation.md): every Must is delivered; complete continuous deployment, classified Could, did not come first | — |
