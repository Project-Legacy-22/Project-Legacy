# Architecture decisions

One structuring decision per file. An ADR is not a meeting record: it records the context at the
time of the choice, the options actually considered, the reason that decided, the accepted cost,
and the observable signal that would call it into question.

An ADR is **immutable once merged**. A decision that changes is not rewritten: a new ADR is opened
and the old one moves to `Superseded by ADR-NNNN`. The history of the decisions is a deliverable
just like the code.

Format: `docs/adr/_template.md`. Continuous numbering, never reassigned.

## Design decisions

How we write the code, independently of the services it depends on.

| ADR | Decision | Status | Unblocks |
|---|---|---|---|
| [0001](0001-perimetre-utilisateur-projets-partages.md) | A project is shared between several accounts | Accepted | `EN-09`, `US-11`, `US-16`, the whole model |
| [0002](0002-typescript-strict.md) | Strict TypeScript across the whole repository | Accepted | `EN-04`, `EN-06` |
| [0003](0003-decoupage-du-backend-par-domaine.md) | Backend split by domain, in layers inside each domain | Accepted | `EN-04` |
| [0006](0006-chaine-front-vite-et-react.md) | Vite for the front-end toolchain, React kept | Accepted | `EN-05` |
| [0011](0011-anglais-pour-le-code-et-l-interface.md) | English for the code and the interface, French for the documentation | Accepted, partly superseded by 0022 | the naming migration, every review |
| [0012](0012-pas-de-formateur-automatique.md) | No automatic formatter for now | Accepted | formatting, which remains held by review |
| [0013](0013-garantie-de-livraison-des-evenements.md) | The outbox is the guarantee, and the notification is the demonstrable effect | Accepted | every event producer, every deployment target |
| [0014](0014-niveau-d-accessibilite-wcag-21-aa.md) | WCAG 2.1 AA as the target level | Accepted | the acceptance criteria of every front-end US |
| [0015](0015-ghcr-comme-registre-d-images.md) | GHCR as the image registry | Accepted | image publication and releases |
| [0016](0016-supervision-prometheus-et-grafana-cloud.md) | Prometheus as the format, Grafana Cloud in Germany as the platform | Accepted | every metric added, the demonstration of the flow |
| [0017](0017-supabase-heberge-dependance-assumee.md) | Hosted Supabase, an owned and reversible dependency | Accepted | every schema change, the exit procedure |
| [0018](0018-migration-des-donnees-par-scripts-sql-relus.md) | Data migration in both directions through generated and reviewed SQL scripts | Accepted | the legacy import, leaving Supabase, every schema change |
| [0019](0019-application-automatique-des-migrations-hebergees.md) | Automatic application of the migrations to the hosted database, additive migrations | Accepted | every migration |
| [0020](0020-relais-par-boucle-de-trente-secondes.md) | Serverless relay through a thirty-second loop | Accepted | every event producer on the serverless target |
| [0022](0022-english-for-the-repository-documentation.md) | English for the whole repository documentation | Proposed | the translation of the documentation |

ADR-0001 was decided **against** the recommendation of the backlog, which proposed a single user.
It carries the reason that won the decision and the cost accepted in exchange.

## Platform decisions

The four decisions that commit to an external service. They are the ones whose exit cost must be
written, and whose technical claims are sourced rather than assumed.

| ADR | Decision | Status | Unblocks |
|---|---|---|---|
| [0004](0004-supabase-comme-sgbd.md) | Supabase as the database, local stack in development and in CI | Accepted | `EN-03`, `EN-09`, `EN-30` |
| [0005](0005-acces-aux-donnees-et-migrations.md) | Access through the Supabase client, schema versioned as migrations | Accepted | `EN-09` |
| [0007](0007-mecanisme-d-evenements-broker-redis.md) | Redis as the event broker | Accepted | `US-10`, `US-18`, `EN-35` |
| [0008](0008-strategie-de-session-supabase-auth.md) | Sessions and authentication through Supabase Auth | Accepted | `US-11`, `US-27`, `US-47`, `US-13` |
| [0009](0009-sonarcloud-comme-outil-de-quality-gate.md) | SonarCloud as the quality gate tool, thresholds of the built-in gate | Accepted | `EN-17` |
| [0010](0010-canal-de-recuperation-de-compte-par-e-mail.md) | Account recovery by email, through Supabase Auth | Accepted | `US-28` |

ADR-0007 was also decided **against** the recommendation of the backlog, which proposed an
in-process bus. The eight blocking decisions (`D-03` to `D-20`) are now covered.

ADR-0009 decides `D-11` (coverage threshold) on a value different from the proposal of the
backlog (80 % instead of 70 %), imposed by the free plan of SonarCloud rather than chosen: the
reason is in the ADR, not here.

## What remains to be decided

These points have no ADR because they have no decision. They do not block sprint 1, but each one
blocks something further on.

| To be decided | Proposal | Blocks | Deadline |
|---|---|---|---|
| Visual direction, and who arbitrates | component library or custom CSS | every front-end US | sprint 3 |

The four other points of this table were ratified on 11 September 2026: the delivery guarantee
and the demonstrable effect by ADR-0013, the accessibility level by ADR-0014, the image registry
by ADR-0015. They had been decided in the code for weeks without any ADR recording it, which is
what #228 corrects.
