# Sign out

- **Issue**: #48
- **Epic**: Auth
- **Delivered**: 2026-09-09
- **Decisions that apply**: ADR-0008

## What it does

A signed-in visitor can end their session from any view that needs one: a button next to
the "Signed in as…" banner, reachable like any other in the tab order. It revokes the
refresh token tied to that one session and clears the session cookie, and answers
identically whether or not a valid session backed the request.

Out of scope: ending every session of the account at once (that already happens as a side
effect of `POST /auth/password/reset`, which has its own reason to want it); an "are you
sure?" confirmation (nothing is lost, unlike US-13's deletion).

## Surface

| Endpoint or screen | Purpose | Auth |
|---|---|---|
| `POST /auth/logout` | Revoke the caller's session and clear its cookie | public |
| Signed-in view → "Sign out" | Calls the endpoint above | requires a session to be visible |

No request or response body. `POST /auth/logout` always answers `204` with no body and no
session cookie, whether or not a valid session backed the request: this is the criterion the
route is built around, not an incidental choice, which is why it is not mounted behind
`requireAccount`.

## Data

No table, column or index is touched. Supabase Auth (GoTrue) owns the refresh token this
revokes, in its managed `auth` schema.

## Events

None. Signing out publishes and consumes nothing.

## Errors

| Situation | Response | Note |
|---|---|---|
| No session, or an unusable one | `204`, identical to a valid session's | Does not disclose whether a session existed |
| Identity provider failure | `500 internal_error` | The cookie is cleared before the provider is ever asked, so the browser has already lost it even here |

## Accessibility

The button is a native `<button>`, reached and activated like any other in the interface.
The return to the sign-in screen moves focus to its heading (`tabIndex={-1}`, focused on
mount): a person using a screen reader or the keyboard alone lands on a heading that
announces where they are, not wherever focus happened to be left.

## Personal data

No personal data is submitted or returned. The session cookie's value (an access token) is
read only to pass to the identity provider and is never logged (asserted by a test).

## How to verify

```
npm run up                 # docker broker + supabase start + dev api and web
```
1. Sign in. The banner reads "Signed in as…" with a "Sign out" button next to it.
2. Focus the "Sign out" button with the keyboard (Tab) and activate it with Enter or Space.
3. The sign-in screen appears immediately; the page's focus is on its heading (inspect
   `document.activeElement`, or confirm a screen reader announces the heading unprompted).
4. In the browser's dev tools, confirm the `session` cookie is gone.
5. Sign in again, copy the `session` cookie's value, sign out, then replay a request with
   the copied value (`curl -H "Cookie: session=<value>" http://localhost:3000/auth/me`):
   `401`.
6. Sign out with no session at all (`curl -i -X POST http://localhost:3000/auth/logout`):
   same `204`, empty body, as step 3's request.

Tests: `packages/core/auth/src/application/sign-out.test.ts`,
`packages/infra/src/supabase-identity-provider-sign-out.test.ts`,
`apps/api/src/http/routes/auth-logout.test.ts`,
`apps/api/test/integration/logout.integration.test.ts` (the one that actually reaches GoTrue:
every other suite above exercises the application's own logic against a fake),
`apps/web/src/api/auth-api.test.ts`, `apps/web/src/app.test.tsx`.

## Known limits

- An access-token JWT already handed out stays valid until it expires (one hour at most)
  even after this call: GoTrue's session revocation acts on the refresh token, not on a JWT
  already in flight, which is stateless by construction. This is the same pre-accepted debt
  ADR-0008 already carries for password reset.
