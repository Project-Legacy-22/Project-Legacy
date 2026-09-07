# <Feature name>

- **Issue**: #NNN
- **Epic**: <Auth | Tasks | Projects | Kanban | Events | Notifications | Quality | CI/CD | GDPR | A11y | Docs>
- **Delivered**: YYYY-MM-DD
- **Decisions that apply**: ADR-NNNN, ADR-NNNN

## What it does

Two or three sentences, from the point of view of the person using the application. What is
now possible that was not possible before, and what is deliberately out of scope.

## Surface

The entry points a caller or a user actually touches.

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `METHOD /path` | | session required / public |

Request and response shapes: name the contract that governs them rather than restating it, so
the schema stays the single source of truth.

## Data

Tables, columns and indexes the feature reads or writes, and the migration that introduced
them. Say who owns a row and how ownership is enforced.

## Events

Events published or consumed, by versioned name. Say what a consumer may rely on. Omit the
section when the feature publishes and consumes nothing.

## Errors

| Situation | Response | Note |
|---|---|---|
| | | |

State the cases that are security relevant, in particular where a forbidden resource is
reported as absent rather than as forbidden.

## Accessibility

Keyboard path, focus handling, and what assistive technology announces. Omit for a feature
with no interface.

## Personal data

Which fields are personal data, where they are stored, how long they are kept, and where they
must never appear: logs, events, error messages, analytics.

## How to verify

Commands or steps that show the feature working on a fresh checkout, and the tests that cover
it.

```
```

## Known limits

What was deliberately left out, and the issue that carries it if there is one.
