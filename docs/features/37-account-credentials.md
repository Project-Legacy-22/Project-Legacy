# Change my email address and my password

- **Issue**: #37
- **Epic**: Auth
- **Delivered**: 2026-09-10
- **Decisions that apply**: ADR-0003, ADR-0008, ADR-0010

## What it does

A signed-in person can change their password, and can change the email address
their account is registered with. Changing the password revokes every other
session of the account and keeps the current one. Changing the address does not
take effect until a confirmation link is followed: the old address stays the
sign-in identifier until then, and with double confirmation a link is sent to
both the old and the new address and both must be followed.

Out of scope: an administrator changing someone else's credentials (there is no
such role); re-authenticating before an email change (the criterion asks for it
only on the password change); a "you were signed out" notice on the other
sessions beyond the sign-in screen they already fall back to (US-27).

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `PUT /auth/me/password` | Change the caller's password | session required |
| `PUT /auth/me/email` | Start a change of the caller's email address | session required |
| `POST /auth/me/email/confirm` | Exchange the token from a confirmation link | public |
| `GET /confirm-email-change` | Serve the app shell for the emailed deep link | public |
| Account section on the signed-in screen | The two forms | session required |
| `/confirm-email-change?token_hash=…&type=email_change` | The confirmation screen | public |

Request and response shapes are governed by `ChangePasswordBody`,
`ChangeEmailBody` and `ConfirmEmailChangeBody` in
`packages/contracts/src/auth.ts`. `PUT /auth/me/password` answers `204` with no
body and no `Set-Cookie`. `PUT /auth/me/email` answers `202` with an empty body.
`POST /auth/me/email/confirm` answers `204` with no body and no session cookie.

The confirm route is public because its link is opened from an email client,
which may land in a browser that never held a session; the token is the
authorization and it travels only in the request body.

## Data

No table, column or index is added. Supabase Auth (GoTrue) owns the password
hash, the email of record, the email-change tokens and their expiry, and the
session revocation, in its managed `auth` schema. `public.users` is a mirror
kept by the `on_auth_user_changed` trigger
(`supabase/migrations/20260904103000_authentication_and_row_level_security.sql`),
which already fires `AFTER UPDATE OF email`, so a confirmed address change
follows into the mirror on its own.

## Events

None. The feature publishes and consumes nothing.

## Errors

| Situation | Response | Note |
|---|---|---|
| No session on `PUT /auth/me/*` | `401 session_required` or `session_expired` | The ordinary session guard |
| Malformed body | `400 validation_error` | Field paths and reasons only, never the submitted value |
| Wrong current password | `403 incorrect_current_password` | Says the rule, not the value; nothing else is done |
| New password below policy | `400 weak_password` | Twelve characters, mixed case and a digit; enforced by the domain, then again by GoTrue |
| New password found in a known breach | `400 compromised_password` | Have I Been Pwned range API; on an outage the check is skipped, length and character rules still apply |
| New email already registered | `202`, identical to a free address | The form does not disclose whether an account exists |
| More than 10 password or confirm calls per caller per 5 min | `429 too_many_attempts` | Per-caller budget, shared by both |
| More than 3 email-change requests per target address per hour | `429 too_many_attempts` | Per-address budget, so one inbox cannot be flooded |
| Unknown, spent or expired confirmation token | `400 invalid_email_change_token` | One message for all three, so it cannot tell whether a change was started |
| Identity provider failure | `500 internal_error` | No address, password or token is ever interpolated into an error or a log |

## Accessibility

The two forms sit in a `panel` section of the signed-in screen, each with its
own heading. Every field has a `<label>`; help and error text are tied to the
input through `aria-describedby`, and an error carries `role="alert"` so it is
announced. The confirmation screen is reached and used entirely from the
keyboard; its result uses `role="status"`, which announces without moving focus.
The new-password field uses `autocomplete="new-password"` and states the policy
before anything is typed; the current-password field uses
`autocomplete="current-password"`.

## Personal data

The email address and the password are personal data. Both travel only in a
request body, never a URL. Neither appears in a log line (a test asserts it) or
in any event. The email-change token is a bearer secret: it travels in a
request body, the confirmation email carries it in the query string for the few
moments before the app wipes it from the address bar, and
`<meta name="referrer" content="no-referrer">` keeps it out of any Referer
header meanwhile. It is never logged. The identity provider's error is attached
as a cause rather than interpolated, so a provider message that quoted the
address does not reach the log through the error middleware.

## How to verify

```
npm run typecheck && npm run lint
npm test
npm run up                  # docker broker + supabase + dev api and web
npm run test:integration
```

By hand, with the stack running:

1. Register an account and sign in in two browsers (A and B).
2. In A, open the account section. Change the password: a wrong current
   password is refused on that field; a short one and `Password12345` (breached)
   are refused; a valid one succeeds.
3. Reload B: bounced to sign-in. Reload A: still signed in.
4. In A, change the email to a fresh address. The confirmation says nothing
   about whether it exists; entering an address that already has an account
   gives the same message.
5. Open the local mail viewer (`supabase status` prints the URL). Two messages,
   one to the old address and one to the new, each linking to
   `/confirm-email-change?token_hash=…&type=email_change`. Follow both. The
   token disappears from the address bar; the `POST` carries it in the body.
6. Sign in: the old address works until both links are followed; after both, the
   new address is the identifier.
7. `PUT /auth/me/password` 11 times from one client: the 11th is `429`.
   `PUT /auth/me/email` 4 times for one target address within an hour: the 4th
   is `429`.

Tests: `packages/core/auth/src/application/{change-password,change-email,confirm-email-change}.test.ts`,
`packages/core/auth/test/fakes/in-memory-identity-provider.test.ts`,
`packages/infra/src/supabase-identity-provider-credentials.test.ts`,
`apps/api/src/http/routes/credentials.test.ts`,
`apps/api/test/integration/credentials.integration.test.ts`,
`apps/web/src/api/credentials-api.test.ts`,
`apps/web/src/components/{credentials-section,confirm-email-change-page}.test.tsx`.

## Known limits

- **An access-token JWT stays valid until it expires** (one hour at most) after
  the other sessions are revoked. This is the pre-accepted debt of ADR-0008.
- **Double confirmation means two links to follow.** `double_confirm_changes` is
  on in `supabase/config.toml`: a change is confirmed on both the old and the
  new address. It is stricter than the criterion, which asks only for the new
  address, and it means a hijacked session cannot move the sign-in address
  without the current owner also receiving and following a link.
- **The breach check fails open.** If Have I Been Pwned is unreachable, a
  compromised password can get through; the length and character-class policy
  still applies.
- **Production email delivery needs an SMTP server** configured at deployment
  (issue #149). Until then the local stack captures the messages instead of
  sending them.
- **The email-change confirmation is not covered by an integration test.**
  Reading the two emitted tokens needs the local mail catcher, which no suite
  drives yet; the adapter test against a fake GoTrue and the HTTP test against
  the in-memory provider cover the exchange, and step 5 above covers it by hand.
