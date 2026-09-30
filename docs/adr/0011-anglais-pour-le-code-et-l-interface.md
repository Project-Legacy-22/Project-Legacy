# ADR-0011 — English for the code and for the interface

- **Status**: Accepted; superseded by ADR-0022 for the language of the documentation and of the GitHub exchanges
- **Date**: 2026-09-10
- **Deciders**: team
- **Related issue**: #15 (finding), the migration has its own

## Context

Two language questions had been lingering since sprint 1, each without a written decision.

The first is in the "To be decided" table of the ADR index: "Language of the interface, error
messages included — a single one, decided once", listed as blocking every front-end US. It was
never decided. In practice, the interface is already entirely in English: `apps/web/src/labels.ts`
holds 121 labels, none of them accented, and none of the API error messages is either. The
decision existed in the code without existing on paper.

The second is the language of the code. `standards/03-testing.md` §3 asks for a test to be named
"in French or in English but **uniformly**", without saying which. Measurement of 10 September on
the 332 test names of the repository: **168 in French, 164 in English**. The split is about half
and half in `apps/web`, in `apps/api` and in `packages` separately, so it is not a convention per
area but a drift. Identifiers and comments follow the same disorder.

The cost is not cosmetic. A reader looking for `fichiersDeTest` does not find `testFiles`. A
keyword search misses half of the repository, and a code review spends its time translating.

## Options considered

### Option A — French everywhere in the code
- Pros: it is the language of the team and of the issues; the business domain names stay close to
  the vocabulary of the User Stories.
- Cons: the ecosystem is English-speaking, so each identifier sits next to an English word we do
  not translate (`request`, `response`, `cursor`, `outbox`); accents force a choice between
  writing them in identifiers, which is fragile, and writing incorrect French; the interface,
  already English with 121 labels, would have to be translated back.
- Implementation cost: the highest of the three, interface included.

### Option B — English for the code and the interface, French for the repository documentation
- Pros: aligns the code with its ecosystem and with the existing interface; makes a keyword search
  reliable; requires no work on the interface; leaves the documentation in the language in which
  the team reasons best, which `docs/features/README.md` already documents for the ADRs and the
  event catalogue.
- Cons: a boundary to maintain, hence one more rule to know; migration of 168 test names and of
  the existing French identifiers.

### Option C — Let everyone choose, requiring only consistency within a file
- Pros: no migration work.
- Cons: it is the current state, and it is already at 168/164. The "uniform" rule without a named
  language prevented nothing in two sprints. A rule that cannot be broken because it says nothing
  is not a rule.

## Decision

We choose **option B**.

Because the interface had already been decided in English without anyone writing it down, and
aligning the code with it costs less than the opposite. Because the current rule produced a
half-and-half split in two sprints, which shows that requiring uniformity without naming the
language is not enough. And because the repository documentation is already officially in French:
the boundary exists, it had not been stated.

### Exact scope

**In English:**
- identifiers — variables, functions, types, files, folders;
- code comments;
- test names, `describe` and `it`;
- the interface, displayed error messages included;
- commit messages and pull request titles, which was already the rule of
  `standards/04-git.md`.

**In French:**
- the repository documentation: ADRs, event catalogue, legacy audit. This ADR is an example of
  it;
- issues, pull request descriptions, review comments and board notes, which are the working
  language of the team.

The pages of `docs/features/` remain in English, as their README already requires.

## Consequences

**Positive**
- A keyword search finds every use of a concept.
- The interface has nothing to change.
- The question is no longer raised at every review.

**Negative / accepted debt**
- 168 test names to translate, plus the French identifiers and comments. This work cannot be done
  at once: 41 of the 60 test files are modified by open pull requests, and touching them would
  cause conflicts for their authors. The migration is therefore done by free areas, with its own
  issue, and the rest after the merges.
- During the migration the repository stays mixed, hence temporarily less consistent than if
  nothing had been decided. It is the cost of a transition, not a final state.

**What it imposes on the rest of the project**
- `standards/02-code-style.md` and `standards/03-testing.md` §3 now carry the designated language,
  instead of "French or English".
- Every new pull request is written in English on the code side. A review can refuse it.
- The "To be decided" table of the index loses its line on the language of the interface.

## How we will know we were wrong

If business domain names become less clear translated than in French — the vocabulary of the User
Stories being French — to the point that a review regularly has to ask what an identifier refers
to. The signal would be a translation discussion in a code review, rather than a discussion about
behaviour.

## References

- `standards/03-testing.md` §3, "uniformly" rule without a designated language
- `standards/04-git.md`, commit messages already in English
- `docs/features/README.md`, repository documentation in French, feature pages in English
- Measurement of 2026-09-10: 332 test names, 168 French, 164 English
