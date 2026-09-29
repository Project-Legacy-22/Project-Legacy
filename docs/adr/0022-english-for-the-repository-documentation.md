# ADR-0022 — English for the repository documentation

- **Status**: Proposed
- **Date**: 2026-09-29
- **Deciders**: team, following the second intermediate defense
- **Related issue**: #427
- **Supersedes**: ADR-0011, for the language of the documentation and of the GitHub exchanges only

## Context

ADR-0011 put the code, the interface, the commit messages and the pull request titles in English,
and kept in French the repository documentation, the issues, the pull request descriptions and the
review comments. Only the pages of `docs/features/` were in English.

The second intermediate defense asked for the whole repository documentation to be in English.
The inventory of 2026-09-24 counted about 77 Markdown files outside `node_modules`, about 57 of
them in French: the root README, the architecture decision records, the first-level pages of
`docs/`, the GDPR register, the event catalogue, the ceremony records and the `.github/` templates.

The split of ADR-0011 has a cost of its own. A reader moves between two languages depending on the
folder, a feature page written in English links to a decision written in French, and one page of
`docs/features/` had already drifted back to French.

## Options considered

### Option A — Keep ADR-0011 as it is
- Pros: no work.
- Cons: does not answer the request of the defense; the boundary between the two languages
  remains a rule to know, and it has already been crossed once.

### Option B — English for all versioned documentation, file names kept
- Pros: one language for everything a reader finds in the repository; no link breaks, since
  every path stays valid, including the paths quoted in issues, pull requests, commit messages and
  code comments.
- Cons: some file names stay in French, for example `docs/gdpr/registre.md` or the ADR slugs.

### Option C — English for all versioned documentation, file names translated
- Pros: complete consistency, names included.
- Cons: every link from an issue, a pull request, a commit or a code comment to a renamed file
  breaks, and the history of each file becomes harder to follow.

## Decision

We choose **option B**.

Because the defense asked for the documentation to be in English, not for its paths to change,
and a renamed file breaks links that nobody can update: those in closed issues, merged pull
requests and commit messages. And because ADR-0011 already showed that a language boundary inside
the repository is crossed as soon as it exists.

### Exact scope

**In English:**
- every Markdown file of the repository: the README files, `docs/` in full, the architecture
  decision records and their template, the ceremony records;
- the `.github/` templates for pull requests and issues;
- consequently the issues, pull request descriptions and review comments written from now on,
  since they are filled in from those templates.

**Unchanged:**
- file and folder names, whatever their language;
- what ADR-0011 already put in English: identifiers, code comments, test names, interface,
  commit messages, pull request titles;
- issues, pull requests and review comments already published: they are not rewritten.

Translating an existing ADR does not change its decision. The rule that a merged ADR is immutable
applies to its content, not to its language: the translation keeps the text, the dates and the
statuses as they were.

## Consequences

**Positive**
- One language across the repository, the code and the documentation.
- A feature page and the decision it links to are read in the same language.

**Negative / accepted debt**
- File names in French remain, and read oddly next to an English content.
- Issues and pull requests published before this decision stay in French, so the history of the
  board is mixed.

**What it imposes on the rest of the project**
- ADR-0011 is marked as superseded by this ADR for the documentation and the GitHub exchanges.
  Its rule for the code is unchanged.
- `docs/features/README.md` no longer announces a French documentation.
- A document added in French is refused at review.

## How we will know we were wrong

A review has to ask what a translated document means, because a term of the team's vocabulary
lost its meaning in English. The signal would be a discussion about the wording of a document
rather than about its content.

## References

- ADR-0011, `docs/adr/0011-anglais-pour-le-code-et-l-interface.md`
- Issue #427, request of the second intermediate defense and inventory of 2026-09-24
