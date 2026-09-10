# Stay signed in between visits, and be signed out cleanly

- **Issue**: #28
- **Epic**: Auth
- **Delivered**: 2026-09-10
- **Decisions that apply**: ADR-0008

## What it does

A session now survives closing the tab and reopening it the next morning, and it survives the
hour-long access token it was opened with. Renewal happens on the request that was already
being made, so nobody meets the sign-in screen in the middle of working. A day without a
single request ends the session, and the person is taken back to the sign-in screen with a
sentence saying the session expired rather than an error or a blank page.

The interface stops calling the API as soon as it knows the session is over. Before this, the
notification count kept asking every two seconds and collecting refusals.

Out of scope: signing out on purpose, which is US-47 and needs an endpoint of its own. Nothing
here lets a person end a session before its time, and the button does not exist yet.

## Surface

No endpoint changes shape and no new endpoint appears. What changes is what the session guard
does before a protected route runs.

| Concern | Where | Effect |
|---|---|---|
| Two cookies | `apps/api/src/http/session.ts` | `session` carries the access token, `refresh` carries the refresh token, both `httpOnly` and `SameSite=Lax` |
| Renewal | `requireAccount` | when the access token is refused and a refresh cookie is present, the session is renewed, both cookies are written again, and the request goes through |
| End of session | `requireAccount` | when nothing can be renewed, both cookies are cleared and the answer is `401 session_expired` |
| Port | `IdentityProvider.refresh` | exchanges a refresh token for a fresh session, or reports that the session is over |

`POST /auth/login` now sets both cookies instead of one. Every route behind `requireAccount`
may answer with `Set-Cookie` even when the request did not concern authentication: that is
what a renewal looks like from the outside.

## Session lifetime

Three durations decide when somebody has to sign in again.

| Duration | Value | Set in | What it bounds |
|---|---|---|---|
| Access token | 1 hour | `jwt_expiry` in `supabase/config.toml` | how long a token is accepted before a renewal is needed |
| Refresh cookie | 24 hours | `MAX_IDLE_MS` in `apps/api/src/http/session.ts` | how long inactivity may last before the session ends |
| Reuse interval | 10 seconds | `refresh_token_reuse_interval` in `supabase/config.toml` | how long a replayed exchange is treated as a retry rather than a theft |

Every renewal writes the refresh cookie again with a full 24 hours, so continuous use never
meets the inactivity bound. It is the browser that enforces it, by dropping a cookie whose
`Max-Age` has passed. See **Known limits**.

Refresh tokens are single-use and rotate at every exchange (ADR-0008). A token presented a
second time inside the reuse interval is a request the network sent twice, and gets the same
session back, which is what keeps two concurrent requests from ending a healthy session. After
that interval, the same token is in two places at once: the provider ends the session and
revokes its tokens, and the next request lands on the sign-in screen.

## Errors

| Situation | Response | Note |
|---|---|---|
| No cookie at all | `401 session_required` | The ordinary first visit. Says nothing about an expiry |
| Access token refused, refresh cookie present and exchangeable | the route's own answer | Plus `Set-Cookie` for both cookies. The caller cannot tell a renewal happened |
| Access token refused, nothing left to renew | `401 session_expired`, both cookies cleared | The interface shows the sign-in screen and says why |
| The identity provider is unreachable | `500 internal_error` | Deliberately not an expiry: an outage must not sign everybody out |

The last line is the distinction the adapter exists to make. Of the answers GoTrue gives to a
refused exchange, only those that mean the token is spent, revoked, expired or unknown end the
session; anything else is reported as a failure of ours.

## Accessibility

The expiry message sits between the page title and its introduction, and carries
`role="alert"` so it is announced rather than waited for: the person was doing something else
and did not ask to be here. The sign-in form below it is the one already covered by the
accessibility audit (#15), unchanged.

## Personal data

No personal data is added, moved or stored by this feature. Both tokens are held in cookies
the page cannot read, and neither appears in a log line, a URL or an error body. The adapter
attaches the provider's error as a cause rather than interpolating it into a message, and the
error middleware logs a type, a status and a trace id.

Two tests hold that: one asserts no token appears anywhere in the log of a renewed request,
the other that the adapter's error message does not quote the token it was given.

## How to verify

Automated, on a fresh checkout:

```
npm run typecheck
npm test
```

The behaviour is covered at three levels. `packages/core/auth/test/fakes/in-memory-identity-provider.test.ts`
pins the rotation the fake models, `packages/core/auth/src/application/renew-session.test.ts`
the use case, `packages/infra/src/supabase-identity-provider-refresh.test.ts` the translation
of GoTrue's answers, and `apps/api/src/http/routes/session-lifetime.test.ts` the whole thing
through real HTTP. On the front, `apps/web/src/session-expiry.test.tsx` and
`apps/web/src/api/guard-session.test.ts`.

By hand, with the stack running (`npm run up`):

```
curl -si -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"you@example.com","password":"..."}' | grep -i set-cookie
# two cookies, both HttpOnly; refresh carries Max-Age=86400

curl -si http://localhost:3000/auth/me -H 'Cookie: refresh=<the refresh value>'
# 200, plus a Set-Cookie for both: the session was renewed from the refresh token alone

curl -si http://localhost:3000/auth/me -H 'Cookie: session=x; refresh=x' | head -20
# 401, body type session_expired, and both cookies expired in the past
```

In a browser: sign in, close the tab, reopen it, and the items are there without a sign-in.
Then delete the `refresh` cookie in the developer tools, act on an item, and the sign-in screen
comes back carrying the reason.

## Known limits

- **The inactivity bound is enforced by the browser, not by the provider.** A refresh token
  GoTrue issued stays exchangeable until it is spent or its session is revoked, so a token
  copied out of a browser would outlive the cookie holding it. Closing that gap means a
  provider-side session timeout (`[auth.sessions]` in `supabase/config.toml`), which is a
  change to the identity provider's configuration and belongs to its own issue.
- **The 24 hours are a constant, not a configuration variable.** Unlike `WEB_ORIGIN` it cannot
  be set per environment. It is one line to promote if a deployment ever needs a different
  value.
- **There is no way to end a session on purpose.** Signing out is US-47. Until it lands, the
  ways a session ends are the inactivity bound, a password reset, and erasing the account.
- **A renewal costs one extra call to the identity provider**, on the first request after an
  access token expires. At one hour per token that is negligible, and it is the price of a
  token the API does not have to store.
