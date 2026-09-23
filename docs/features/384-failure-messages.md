# What a failed request says

- **Issue**: #384
- **Epic**: Quality
- **Decisions that apply**: ADR-0011 (English for the code and the interface)
- **Related**: #383 (the API answers an unavailable dependency with `503` and `Retry-After`)

## What it does

Every failed request now tells the person what happened and what to do, according to its cause.
The decision lives in one module, `apps/web/src/api/failure.ts`; every client of `apps/web/src/api/`
goes through it, so two screens cannot describe the same failure differently.

| Answer | Message | Why |
|---|---|---|
| `400`, `404`, `409`, `413` | the API's own `detail` | Written for a user: a missing task, a conflicting edit, a body too large |
| `403` with a `detail` | the API's own `detail` | A domain refusal such as "The current password is incorrect." |
| `403` without one | operation, then "You are not allowed to do this." | |
| `401` | unchanged | The session guard signs the person out and the sign-in screen says why |
| `429` | operation, then "Too many attempts. Try again in N seconds/minutes." | `N` read from `Retry-After`; "in a moment" when absent |
| `502`, `503`, `504` | operation, then "The service is temporarily unavailable. Try again in N seconds." | A passing outage: waiting is the right move |
| any other `5xx` | operation, then "Something went wrong on our side. Try again; if it keeps happening, quote reference `traceId`." | The reference is the request's trace id, which finds the cause in the log |
| no answer at all | "Unable to reach the server. Check your connection and try again." | `fetch` rejected: offline, DNS, connection reset |
| request aborted | nothing | The screen that sent it is gone; every hook already ignores it |

"Operation" is the caller's own sentence, such as "Unable to remove the item.": it names what
failed, the status sentence says why.

## What it deliberately does not show

The password reset request and the email change never show the server's `detail`, whatever the
status: either could tell which addresses have an account. They go through `statusMessage`, which
still explains a throttle or an outage, since neither discloses anything about an address. Sign-out
keeps its fixed message: the session is cleared on this device whatever the server answers, and
"try again" would suggest otherwise.

A body that is not a problem document -- the HTML page of a proxy in front of the API -- is read by
its status alone.

## How to verify

1. `npx vitest run --project dom apps/web/src/api/failure.test.ts apps/web/src/app-failures.test.tsx`
2. With the application running, stop the API: the session check says the server cannot be reached.
3. Sign in with a wrong password eleven times from one client: the eleventh answer says how many
   minutes to wait.
