# ADR-0010 — Account recovery by email, through Supabase Auth

- **Status**: Accepted
- **Date**: 2026-09-08
- **Deciders**: team, planning of US-28
- **Related issue**: #29

## Context

US-28 asks that a user who forgot their password can reset it. The backlog attached this item to
US-18 (in-app notifications), but a password recovery must reach someone who, by definition, can
no longer sign in: it therefore necessarily goes outside the application. The note of issue #29
explicitly anticipated it: "the only item likely to require an email channel; the decision can
be taken at its planning".

ADR-0008 already entrusts Supabase Auth (GoTrue) with the credentials, the hashing, the sessions
and the *password recovery*. GoTrue natively sends a recovery email. The local Supabase stack
(ADR-0004) runs in development and in CI. No production SMTP provider is provisioned to date, and
decision D-14 on the notification channel was not decided.

## Options considered

### Option A — Email sent by GoTrue, captured locally by the mail catcher of the Supabase stack
- Pros: native, no sending code to write, aligned with ADR-0008; the token exchange happens
  entirely on the server side (`verifyOtp` on the token hash); the local mail catcher makes the
  flow verifiable on a freshly cloned repository without sending anything.
- Cons: depends on a production SMTP to be provided at deployment; deliverability is outside our
  control; the "compromised password" protection of Supabase is reserved for the Pro plan, hence
  unavailable locally.
- Implementation cost: plug two methods into the `IdentityProvider` port and test them.

### Option B — In-app notification (US-18)
- Pros: no external channel, no additional secret.
- Cons: **unusable for this case** — the user cannot sign in to read the notification. Discarded
  for that reason alone.

### Option C — Third-party channel (SMS, magic link through an external service)
- Pros: independent of email.
- Cons: new dependency, new secret, learning cost, and collection of one more piece of personal
  data (the phone number), contrary to the minimisation stated by ADR-0001 and the GDPR
  standard.

## Decision

We choose **option A**.

Because:

1. It is the only usable channel when the user is precisely locked out.
2. GoTrue already provides it: US-28 comes down to plugging in the mechanism and **testing its
   behaviour**, like US-11 and US-27 under ADR-0008, instead of writing it.
3. The local mail catcher makes the demonstration reproducible on a fresh checkout without
   configuring or calling a real mail server.

The token exchange is done **on the server side**: the `recovery` email template sends the token
hash as a query parameter on our own path (`/reset-password`), an API route exchanges it for a
session (`verifyOtp`), sets the new password (`updateUser`) then revokes every session of the
account (global `signOut`). No token reaches the browser, and the `httpOnly` cookie discipline of
US-11 is preserved.

## Consequences

**Positive**
- The recovery token is single-use and expires, natively (`otp_expiry`).
- The revocation of every session at reset is explicit and checked by a test, independently of
  the GoTrue version.
- No table, no migration: the data model is not touched.

**Negative / accepted debt**
- A production SMTP server must be configured at deployment (`[auth.email.smtp]` in
  `supabase/config.toml`, credentials through environment variables). Deferred and tracked,
  outside the scope of US-28.
- The "compromised password" check required by the quality standard is not provided by Supabase
  outside the Pro plan: the application carries its own check against the *range* API of Have I
  Been Pwned (k-anonymity, fail-open when the service is down).
- An access JWT remains valid until it expires (one hour at most) after the sessions are revoked:
  a debt already acknowledged by ADR-0008.

**What it imposes on the rest of the project**
- `site_url` in development points to the origin actually served (Vite), and a deployment
  overrides it with its public origin.
- A custom `recovery` email template sends the token hash to our path.
- The API serves the application shell on `/reset-password`: it is the first deep link the
  product exposes.

## How we will know we were wrong

A high bounce rate of the recovery emails in production, or a requirement of the subject imposing
a strict timing equivalence of the responses that the GoTrue model cannot guarantee. In that
case: add a constant-time floor in the use case, or write the sending ourselves while keeping
Supabase for the data (the fallback already described by ADR-0008).

## References

- Issue #29 (US-28); ADR-0004, ADR-0008; decision `D-14`
- `docs/features/29-password-reset.md`
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/local-development/cli/config
