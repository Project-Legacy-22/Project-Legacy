# Privacy policy and consent

- **Issue**: #38
- **Epic**: GDPR
- **Delivered**: 2026-09-10
- **Decisions that apply**: ADR-0004, ADR-0008, ADR-0011

## What it does

Somebody about to create an account can read what the application collects and why, before
deciding. The policy opens from the registration form and from the footer, with no account
and no session, and it is linkable so it can be sent to somebody who has neither.

Creating an account now requires agreeing to it. The box starts unticked and nothing ticks it
on the reader's behalf, the API refuses a registration without it, and the version that was on
screen is stored with the account: a later change to the text leaves a record of what each
person actually agreed to.

Out of scope: asking existing accounts to agree again when the version changes. Nothing
prompts them, and the column simply holds the older version. The query that finds them is the
partial index this issue adds.

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `POST /auth/register` | Refuses a registration without consent | public |
| Privacy policy screen | The published text, reachable at `?privacy` | public |
| Registration form | Consent checkbox and a link to the policy | public |
| Footer | The same link, on every screen | public |

The request shape is `RegisterAccountBody` in `packages/contracts`. Consent is
`literal(true)` rather than a boolean, so `false` and an absent field are both rejected with
the field named. The version is `literal(PRIVACY_POLICY_VERSION)`: a form left open across a
policy change is refused rather than recorded against a text its reader never saw.

## Data

| Column | Meaning |
|---|---|
| `public.users.policy_version` | Which version was agreed to. Null for accounts that predate this |
| `public.users.policy_accepted_at` | When. Null alongside a null version |

Added by `20260910110000_record_policy_consent`, along with a partial index on the accounts
without consent, which are the only ones anybody queries for.

The consent is written by the mirror trigger, from the metadata the sign-up carries, so the
transaction that creates the account records it. A second write from the API afterwards could
leave an account that exists without one. Any other path into `auth.users` -- a future
provider, an administrator in the dashboard -- lands with a null version that the index finds,
rather than looking consented.

## Errors

| Situation | Response | Note |
|---|---|---|
| Consent absent or false | `400` | Field named. Refused server side, not merely unticked in the form |
| Version not the published one | `400` | A stale form is refused rather than recorded |
| Address already taken | `201` | Unchanged: the answer must not reveal that an account exists |

## Accessibility

The checkbox carries a label associated by `for`. Its error is tied to it by
`aria-describedby`, marked `aria-invalid`, and announced with `role="alert"` and
`aria-live="assertive"` -- the box sits at the end of the form, so the message can appear
outside what the reader is looking at.

The policy opens from a button rather than a link. Nothing in this application navigates: a
link would promise an address that does not answer.

## Known limits

**The wording is not reviewed by anyone qualified.** It restates `docs/gdpr/registre.md`
faithfully, but neither that register nor this text has been read by someone with a legal
background. That is a fair thing to say in a review and a fair thing to say to a jury.

**The Supabase hosting region is not settled.** An instance outside the European Union would
require the policy to describe how transfers are framed, and it currently says nothing about
it. The register records the same gap.

**The policy is in English**, like the rest of the interface, per ADR-0011. The register it
restates is in French, as regulatory documentation. Whether a policy shown to French users
should follow the interface or the register is a question this issue does not settle.
