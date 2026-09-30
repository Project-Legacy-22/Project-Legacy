## Context

Why this change. One or two sentences.

## What changes

- 
- 

## Related issue

Closes #

## How to test

1. 
2. 

## Impacts

- **API**: none / backward-compatible addition / breaking change (detail)
- **Database**: none / migration added (reversible?)
- **Events**: none / new event / change (new version?)
- **Dependencies**: none / addition (name, reason, licence, weight)
- **GDPR**: no personal data affected / detail
- **Accessibility**: not applicable / checked with the keyboard and for contrast

## Checklist

- [ ] `tk verify` is green
- [ ] This PR targets `dev` (a PR to `main` is a release, opened by `tk release`)
- [ ] Branch rebased on `origin/dev`
- [ ] Tests covering the business logic added
- [ ] Every acceptance criterion of the issue is covered
- [ ] Diff reviewed by myself, no dead code and no `console.log`
- [ ] No secret, no personal data in the logs or the events
- [ ] Documentation updated (README / ADR / OpenAPI)
- [ ] Fewer than 400 lines of diff, or a justification above
