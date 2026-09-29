# ADR-0008 — Sessions and authentication managed by Supabase Auth

- **Status**: Accepted
- **Date**: 2026-09-02
- **Deciders**: whole team, kickoff meeting
- **Related issue**: #2

## Context

The legacy code has no notion of a user (`DET-28`). Four User Stories depend directly on the
session strategy: `US-11` (authentication), `US-27` (clean expiry), `US-47` (sign-out) and
`US-13` (account deletion).

The requirement shared by these four items is **revocation**: a session must be able to end
before its natural expiry.

## Options considered

### Option A — JWT alone
- Pros: simple, without session storage.
- Cons: **cannot be revoked**. A stolen token stays valid until it expires. Contradicts `US-27`,
  `US-47` and `US-13`. Discarded for that reason alone.

### Option B — Server session, written by us
- Pros: revocable, entirely under our control.
- Cons: we would carry the storage, the rotation, the password hashing and the password policy —
  that is the easiest part to get wrong in an application assessed on security.
- The recommendation of the backlog (`D-19`) described this option: short access token, revocable
  refresh token, `httpOnly` cookie.

### Option C — Supabase Auth
- Pros: implements exactly the mechanism the recommendation described, without us writing it.
  Consistent with ADR-0004, already chosen for the data.
- Cons: the behaviour is that of the provider; what it does not do, we cannot make it do.

## Decision

We choose **option C — Supabase Auth**.

Because:

1. What the recommendation described is what Supabase Auth already does. Checked in its
   documentation: the access token is a short-lived JWT — one hour by default — carrying a
   `session_id`; the refresh token is single-use and rotates on each exchange, with a reuse
   interval of ten seconds by default to absorb network replays; a reuse outside that interval
   **terminates the session and revokes all its tokens**; sign-out deletes the sessions concerned
   from the database.
2. Writing this mechanism ourselves would make us carry the most expensive risk of the project
   for no gain at the assessment — the subject assesses that revocation works, not who wrote it.
3. ADR-0004 already brings in the Supabase client. A third-party authentication would make two
   identities of the caller coexist, hence two places where authorization can diverge.

## Consequences

**Positive**
- `US-11` and `US-27` come down to plugging in the mechanism and **testing its behaviour**,
  instead of writing it.
- Revocation at sign-out is real and verifiable, which `US-47` requires.
- The RLS policies rely on the authenticated identity: the membership of ADR-0001 is expressed at
  the database level.

**Negative / accepted debt**
- The password policy — twelve characters, check against a list of compromised passwords — is
  configured on the Supabase side. **To be checked in the real configuration before ticking
  `US-11`**, not assumed.
- Storing the token in an `httpOnly` cookie is not the default behaviour of a browser client: it
  is an explicit point of attention of `US-11`, not a given.
- A missing RLS policy fails **silently**: the query returns nothing instead of raising an error.
  A test that only checks "denied access does not return the data" would also pass on an empty
  table. Every authorization test must therefore first check that the data is indeed visible to
  a member.

**What it imposes on the rest of the project**
- The `auth` domain exposes a port; the Supabase client remains an adapter (ADR-0003).
- `US-13` (account deletion) must describe what is deleted on the Supabase side **and** on the
  application data side: the two are not the same logical database.

## How we will know we were wrong

If a requirement of the subject cannot be met within the model of Supabase Auth — an imposed
session duration, an account deletion that must cascade elsewhere — we keep Supabase for the data
and write the session ourselves. This is why the `auth` domain must stay independent of the
client: without that port, this fallback would cost a rewrite instead of an adapter.

## References

- `docs/backlog.md`, decision `D-19`
- `docs/audit-legacy.md`, debt `DET-28` (`SP-00`, PR #107)
- https://supabase.com/docs/guides/auth/sessions
- Team standards, `standards/07-quality-gates.md`, security section
