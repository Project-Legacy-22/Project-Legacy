# API security hardening

- **Issue**: #30
- **Epic**: Quality
- **Delivered**: 2026-09-09
- **Decisions that apply**: none introduced; implements `standards/07-quality-gates.md` section 5

## What it does

Every HTTP response the API sends now carries a set of security headers, including a content
security policy that only allows the application to load its own scripts, styles and fonts.
Cross-origin browser calls are refused unless they come from the one configured front-end
origin. A request body over 16 KiB is rejected with an explicit `413` instead of being read
into memory. A malformed JSON body is answered with a `400` rather than a generic `500`. No
error response reveals a stack trace, a SQL fragment, a table name or the server technology.

This is an enabler: it changes how existing endpoints respond at their edges and adds no new
endpoint, no screen and no data. What was already in place stays in place. The per-address
and per-origin rate limits on sign-in, sign-up and password reset were built with US-11 and
US-28; this issue makes their client key trustworthy behind a proxy and does not touch the
limiter itself.

Out of scope: a rate-limit store shared between processes (the deployment is single-instance,
see **Known limits**), and authorization, which is enforced per request by `requireAccount`
and covered by the account and item route suites.

## Surface

No endpoint changes shape. The following apply to every route:

| Concern | Where | Effect |
|---|---|---|
| Security headers | `apps/api/src/http/security-headers.ts` (helmet) | CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`, cross-origin isolation headers |
| Server header removed | `app.disable('x-powered-by')` plus helmet | no `X-Powered-By` on any response |
| CORS | `apps/api/src/http/cors.ts` | `Access-Control-Allow-Origin` echoes the configured origin and only that origin, never `*`; preflight answered without reaching a route |
| Body size | `express.json({ limit: '16kb' })` in `apps/api/src/http/server.ts` | oversize body rejected before it is buffered |
| Proxy trust | `app.set('trust proxy', config.trustProxy)` | `req.ip`, the rate limiter's key, follows `X-Forwarded-For` only for the declared number of hops |

The content security policy is spelled out rather than extended from helmet's default,
because its correct value depends on the front-end build. The Vite production build emits
hashed asset files referenced by external `<script type="module">` and `<link rel="stylesheet">`
tags and injects nothing inline, and `apps/web` styles every component through external CSS,
so `default-src 'self'` with `img-src 'self' data:` covers it. A future inline bootstrap
script would need its hash added here.

## Configuration

Two optional variables, validated by `apps/api/src/config.ts` at startup like every other one
(EN-30). Both have a development-safe default, so `npm run up` and `npm run dev` need no `.env`.

| Variable | Default | Meaning |
|---|---|---|
| `WEB_ORIGIN` | `http://localhost:5173` | The single browser origin allowed a cross-origin call. Must be a URL. Never a wildcard. Set to the deployed origin in production. |
| `TRUST_PROXY` | `0` | Reverse-proxy hops in front of the process that may set `X-Forwarded-For`. `0` trusts none, which is correct for a direct connection. Behind one proxy in production, set `1`. |

The front is served from the API's own origin in every environment (the Vite dev server
proxies `/auth` and `/items` to the API), so `WEB_ORIGIN` is only ever consulted to refuse
everything else.

## Errors

| Situation | Response | Note |
|---|---|---|
| Request body over 16 KiB | `413 payload_too_large` | Fixed message; the submitted body is never echoed |
| Body declared as JSON but not parseable | `400 malformed_body` | Was a `500` with an "unhandled failure" log before this issue |
| Cross-origin call from an origin other than `WEB_ORIGIN` | no `Access-Control-Allow-Origin` header | The browser blocks the response; the server does not need to |
| Any failure the code did not model | `500 internal_error`, body `The request could not be processed.` | No stack, no SQL, no table name; the cause is in the log under the request's trace id and nowhere else |

The `413` and `400` above are produced by the single error middleware
(`apps/api/src/http/error-middleware.ts`), like every other error: a body-parser rejection is
mapped to its own status instead of falling through to `500`.

## Personal data

None handled here. The measures reduce what leaves the process: an error body no longer
carries internal detail, and the request-log line was already limited to method, path,
status, duration and trace id (`apps/api/src/http/request-log.ts`). The rate limiter keys on
the caller's address, held in memory for the length of one window and never logged.

## How to verify

Automated, on a fresh checkout:

```
npm run typecheck
npm test
npm run build && test -f apps/api/dist/static/index.html
```

The last line also lets you confirm the CSP assumption: open
`apps/api/dist/static/index.html` and check it contains no inline `<script>` or `<style>`.

By hand, with the stack running (`npm run up`):

```
curl -sI http://localhost:3000/ | grep -iE 'content-security-policy|x-content-type-options|x-powered-by'
# CSP and nosniff present, x-powered-by absent

curl -sI -X OPTIONS http://localhost:3000/auth/login -H 'Origin: http://evil.example' | grep -i access-control-allow-origin
# no output: the origin is refused

curl -sI -X OPTIONS http://localhost:3000/auth/login -H 'Origin: http://localhost:5173' | grep -i access-control-allow-origin
# Access-Control-Allow-Origin: http://localhost:5173

curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' --data "{\"e\":\"$(head -c 20000 < /dev/zero | tr '\0' x)\"}"
# 413

curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' --data '{bad'
# {"type":"malformed_body",...,"status":400,...}

npm audit --audit-level=high
# found 0 vulnerabilities
```

Tests: `apps/api/src/http/security.test.ts` (headers, CORS, body limits, error
non-disclosure, proxy trust versus the rate-limiter key), `apps/api/src/config.test.ts`
(defaults and validation of `WEB_ORIGIN` and `TRUST_PROXY`),
`apps/api/src/http/error-middleware.ts` coverage through the suites above. The existing `429`
assertions in `apps/api/src/http/routes/auth.test.ts` and `auth-password-reset.test.ts` cover
the rate limits themselves.

## Known limits

- **The rate limiter is per process.** Its windows live in the memory of one instance, which
  matches a single-instance deployment. A horizontally scaled deployment would let a caller
  get N times the budget with N instances behind a load balancer; a shared store (Redis is
  already in the stack) is the fix, and it is not built here.
- **`npm audit` reflects the advisory database at the time CI runs.** A clean result is not a
  permanent property. The CI job fails the build on a high or critical advisory; a new
  advisory against an unchanged dependency will surface on the next unrelated pull request.
- **HSTS is emitted regardless of transport.** helmet's default `Strict-Transport-Security`
  is sent over plain HTTP in development too. A browser ignores it there, and production is
  HTTPS, so this is left as the default rather than made conditional.
- **The CSP is asset-shape dependent.** It assumes the Vite build keeps emitting external,
  hashed assets with no inline script. If a build step changes that, the policy must move to
  hashes or the app will fail to load its own bundle.
