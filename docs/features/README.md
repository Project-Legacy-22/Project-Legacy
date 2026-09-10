# Feature documentation

One page per delivered issue. A page explains what the feature does and how to exercise it,
for someone who did not write it and will not read the diff.

The page ships in the same pull request as the code it describes, so it is reviewed with the
code and cannot drift from it. An issue is not done until its page exists and is listed below.

Format: `docs/features/_template.md`. File name: `<issue-number>-<slug>.md`.

These pages are written in English. The rest of the repository documentation, including the
architecture decision records and the event catalogue, is in French.

## Scope

A feature page is not an architecture decision record. It records behaviour, not the reasoning
behind a structural choice: a decision that constrains the rest of the project goes to
`docs/adr/` and is linked from the page. It is not a changelog either, and it is not a copy of
the acceptance criteria: it describes the feature as it now behaves, in the present tense.

## Index

| Issue | Feature | Epic |
|---|---|---|
| [#14](14-export-and-delete-account.md) | Export and delete my personal data | GDPR |
| [#15](15-accessibility-audit.md) | Accessibility audit of the delivered screens | A11y |
| [#29](29-password-reset.md) | Password reset | Auth |
| [#48](48-logout.md) | Sign out | Auth |
