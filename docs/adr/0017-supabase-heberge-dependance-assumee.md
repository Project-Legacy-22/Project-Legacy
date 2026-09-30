# ADR-0017 — Hosted Supabase, an owned and reversible dependency

- **Status**: Accepted
- **Date**: 2026-09-12
- **Deciders**: team, after the intermediate defense
- **Related issue**: #273, extends ADR-0004

## Context

ADR-0004 chose Supabase as the database for what the CLI brings to local development. It did not
rule on hosting: neither the location of the data, nor the dependency on a non-European provider,
nor what happens if the project disappears. The intermediate defense asks for this choice to be
owned and documented.

Facts measured on 12 September 2026, with `supabase projects list`:

| | |
|---|---|
| Project | `Legacy`, created on 2 September 2026 |
| Region | `eu-west-1`, Ireland |
| Status | `ACTIVE_HEALTHY` |
| PostgreSQL | 17.6 |
| Plan | free |

The data is therefore in the Union. What remains to be owned lies elsewhere: Supabase Inc. is an
American company and the infrastructure is AWS, so the CLOUD Act applies to the processor even when
the region is European. And the free plan offers no retention commitment: a project without
activity is paused, and restoration then depends on the provider.

## Options considered

### Option A — Hosted Supabase, free plan
- Pros: the database, authentication, row policies and storage come together. The CLI applies the
  same migrations locally and on the target, so development and production do not diverge. No
  cost.
- Cons: an American processor, no retention guarantee, and part of what it provides — GoTrue, the
  row policies — is not standard PostgreSQL.

### Option B — PostgreSQL managed by a European host
- Pros: European processor and jurisdiction, contractual retention commitment.
- Cons: authentication, row policies and storage have to be written or assembled. Paid. For a team
  of six over three sprints, time is what is missing, not money.

### Option C — Self-hosted PostgreSQL
- Pros: no dependency, no foreign jurisdiction.
- Cons: backups, updates, availability and security become our work, and nobody in the team would
  take care of them while the features wait.

## Decision

We choose **option A**, and we own it under three conditions that are part of the decision.

**The region stays European.** `eu-west-1` today; a change of region is a change of decision, not
a setting.

**The dependency is written, not implicit.** The register of processing activities names the
processor, its region and its company; the privacy policy tells the reader what each one holds,
where, and who accesses it, including that the service key bypasses the row policies and is used
only by the application.

**Leaving remains possible, and in both directions.** The schema is described by versioned
migrations, so any PostgreSQL rebuilds it. What is not SQL — authentication and the row policies —
is the part to rewrite, and it is named rather than discovered on the day we have to leave.

A rebuildable schema is not enough, however: the data must also be able to move. Two paths are
therefore required, and tested before they are needed rather than under pressure: taking in data
coming from a MySQL or a SQLite — the two engines of the original project — into our PostgreSQL
(#275), and taking ours out to any PostgreSQL, a MySQL or a SQLite (#282). Both paths are
delivered, and `npm run test:migration` replays them on three real engines; `docs/data-migration.md`
holds the commands. Backing up, restoring and measuring what a departure would cost is the subject
of `docs/backup-and-exit.md` (#274).

These two exits are not equivalent, and the difference must be written rather than discovered.
Towards a PostgreSQL rebuilt by the migrations, the export is faithful: nothing is lost. Towards a
MySQL or a SQLite, it is faithful **only if the target schema is translated from ours**; rewriting
the data into the three-column `todo_items` table of the original project would lose the project,
the owner, the priority, the due date and the notifications. The exit path therefore translates the
schema, it does not go back to the legacy.

## Consequences

**Positive**
- The data stays in the Union, and this can be checked with a command.
- Local development and the target apply the same migrations, so a difference of behaviour between
  the two is a defect, not a fatality.

**Negative / accepted debt**
- A processor subject to the CLOUD Act. Today the project processes neither health data nor
  sensitive data within the meaning of article 9: the constraint does not arise, and this is what
  makes option A acceptable. It will arise the day sensitive data enters the scope. On that day,
  moving to option B must be **a migration, not a rewrite**: a change of host and jurisdiction, not
  a change of application. This is the reason for the two data paths above. Building them now,
  while nothing requires it, is the only moment when they can be tested without urgency.
- No retention commitment on the free plan. This is why a backup outside Supabase is required and
  not merely recommended.
- GoTrue and the row policies are an exit cost, not code of our own.

**What it imposes on the rest of the project**
- Every schema change goes through a versioned migration. A change made by hand in the dashboard
  would be invisible to a rebuild, hence forbidden.
- No personal data goes to a processor that is not in the register.

## How we will know we were wrong

A pause of the project that we cannot recover from with the repository backup alone. Or a feature
that requires leaving Supabase and turns out not to be reversible because it relied on something
other than SQL. Or sensitive data entering the scope while the exit path has never been run:
reversibility would then be an intention, not a property.

## References

- Measured facts: `supabase projects list`, 12 September 2026
- ADR-0004 (Supabase as the database), ADR-0005 (data access and migrations)
- `docs/gdpr/registre.md`, section "Processors and location"
- `docs/backup-and-exit.md` for the backup, the tested restore and the cost of a departure
- `docs/data-migration.md` for both directions of data movement
