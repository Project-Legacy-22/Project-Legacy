# Password reset

- **Issue**: #29
- **Epic**: Auth
- **Delivered**: 2026-09-08
- **Decisions that apply**: ADR-0003, ADR-0008, ADR-0010

## What it does

Someone who has forgotten their password can ask for a reset link by email, follow it, and
set a new password. Completing a reset signs out every other session of the account. The link
is single-use and expires after an hour.

Out of scope: reset by SMS or any channel other than email; a "change my password while
signed in" flow (that is US-36); provisioning a production SMTP server (deferred, tracked
against a deployment task).

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `POST /auth/password/forgot` | Request a reset link for an address | public |
| `POST /auth/password/reset` | Exchange the emailed token and set a new password | public |
| `GET /reset-password` | Serve the app shell for the emailed deep link | public |
| Sign-in screen → "Forgot your password?" | Opens the request form | public |
| `/reset-password?token_hash=…&type=recovery` | The set-new-password screen | public |

Request and response shapes are governed by `RequestPasswordResetBody` and
`ResetPasswordBody` in `packages/contracts/src/auth.ts`. `POST /auth/password/forgot` always
answers `202` with an empty body; `POST /auth/password/reset` answers `204` with no body and
no session cookie.

## Data

No table, column or index is added. Supabase Auth (GoTrue) owns the recovery token, its
expiry and session revocation, in its managed `auth` schema. `public.users` is a mirror
maintained by the `on_auth_user_changed` trigger and is not touched, because an address does
not change during a reset.

## Events

None. The flow publishes and consumes nothing; it does not use the in-app notification
pipeline (see ADR-0010 on why US-18 is not a real dependency).

## Errors

| Situation | Response | Note |
|---|---|---|
| Malformed address on `forgot` | `400 validation_error` | |
| Address not registered on `forgot` | `202`, identical to a registered one | Does not disclose whether an account exists |
| More than 3 requests per address per hour | `429 too_many_attempts` | Per-address budget |
| More than 10 reset calls per origin per 5 min | `429 too_many_attempts` | Per-origin budget, shared by both endpoints |
| Unknown, consumed or expired token on `reset` | `400 invalid_reset_token` | One message for all three, so it cannot tell whether a link ever existed |
| New password below policy on `reset` | `400 weak_password` | Enforced by the domain before the token is spent |
| New password found in a known breach | `400 compromised_password` | Have I Been Pwned range API; on an outage the check is skipped (length and character rules still apply) |
| Identity provider failure | `500 internal_error` | The token is never interpolated into an error or a log |

## Accessibility

Both screens are reached and used entirely from the keyboard. Every field has a `<label>` and
its help and error text are tied to the input through `aria-describedby`. Errors are
announced with `role="alert"`; the request confirmation and the success message use
`role="status"`, which announces without moving focus. The new-password field uses
`autocomplete="new-password"` and states the policy before anything is typed.

## Personal data

The email address is personal data. It is submitted to `POST /auth/password/forgot` in the
request body only, never a URL, and it does not appear in logs (asserted by a test) or in any
event. The reset token is a bearer secret: it travels only in a request body, the recovery
email link carries it in the query string for the few moments before the app wipes it from
the address bar, and `<meta name="referrer" content="no-referrer">` keeps it out of any
Referer header in the meantime. It is never logged.

## How to verify

```
npm run up                 # docker broker + supabase start + dev api and web
```
1. Register an account and sign in in two separate browsers (sessions A and B).
2. On the sign-in screen, follow "Forgot your password?", enter the address, submit. Enter a
   non-existent address: the confirmation and the latency are the same.
3. Open the local mail viewer (`supabase status` prints the URL). The message links to
   `http://localhost:5173/reset-password?token_hash=…&type=recovery`. An unknown address
   produces no message.
4. Follow the link. The token disappears from the address bar immediately; the `POST` to
   `/auth/password/reset` carries it in the body, and no request shows a Referer with the
   token. A short password is refused; a breached password (`Password12345`) is refused; a
   valid one succeeds.
5. Reload sessions A and B: both are bounced to sign-in. Reuse the same link: rejected.
   Request a second link, then try the first: also rejected.
6. Sign in with the new password.
7. Request a reset four times for the same address within an hour: the fourth is `429`.

Tests: `packages/core/auth/src/application/{request-password-reset,reset-password}.test.ts`,
`packages/core/auth/test/fakes/in-memory-identity-provider.test.ts`,
`packages/infra/src/{supabase-identity-provider,hibp-password-registry}.test.ts`,
`apps/api/src/http/routes/auth-password-reset.test.ts`,
`apps/web/src/api/auth-api.test.ts`,
`apps/web/src/components/{request-reset-form,reset-password-page}.test.tsx`,
`apps/web/src/app.test.tsx`.

## Known limits

- An access-token JWT stays valid until it expires (one hour at most) after the other
  sessions are revoked. This is the pre-accepted debt of ADR-0008.
- "Comparable response time" for a registered and an unregistered address is guaranteed at
  the use-case level, where the code provably does not branch, not against GoTrue's own
  timing.
- The breach check fails open: if Have I Been Pwned is unreachable, a compromised password
  can get through. The length and character-class policy still applies.
- Production email delivery needs an SMTP server configured at deployment; until then, the
  local stack captures messages instead of sending them.
