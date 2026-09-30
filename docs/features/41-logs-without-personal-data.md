# Logs without superfluous personal data (EN-40)

A log that accumulates email addresses becomes a second store of personal data: one the
register does not describe, and one the erasure US-13 promises never reaches. Redaction
already existed at the logger. What was missing was the guard that stops it from eroding.

## What the logger now hides

`packages/infra/src/logger.ts` redacted the request body, the authorization and cookie
headers, and any field named `password`. It now also hides the session pair, the recovery
token of a password reset, anything else named a token, and the address itself.

The session pair is listed in both spellings, `accessToken` and `access_token`. The domain
uses camel case and the identity provider's payloads arrive in snake case; a list that knew
only one of the two would let the other through.

Every entry names a field this codebase actually writes. A list aimed at fields nobody logs
would read as protection without being any.

## The guard, and why it lives in the test double

The issue asks for a control that reads the logs the test suite produces and fails on an
address or a token. The obvious shape -- a script scanning the run's output -- would have
guarded nothing here: every side that logs is tested against `recordingLogger`, and nothing
this project runs writes a log to stdout during a test. That script would have scanned an
empty stream and passed for ever, reporting a guarantee nobody had checked.

So the control sits inside the recording logger itself, in
`packages/contracts/test/fakes/log-hygiene.ts`. It inspects every line before it is stored
and throws when it finds one. Three consequences follow:

- every test of the repository carries the control, including tests written after it, and
  none of them has to remember to;
- the failure fires at the call site, so it names the test that logged and the field it
  logged;
- an `Error` is walked by hand -- message and stack are not enumerable, and an address inside
  an error message is the likeliest way one reaches a log at all.

It refuses an address anywhere in the record, a JSON Web Token, and any field whose name
announces a credential yet holds a readable value.

## The false positive it produced first, and what it taught

The first version recognised a token by its opening `eyJ`. That is the base64url of the two
characters opening any JSON object, and this repository builds its pagination cursor by
encoding a small object exactly that way. The guard flagged the item cursor on every
paginated request.

The pattern now matches the three dot-separated segments a JSON Web Token actually has. The
regression is covered both ways: `log-hygiene.test.ts` asserts that an address, a signed
token and a credential field are refused, and that a pagination cursor, an identifier and an
already-redacted field are not. A control that cries wolf gets ignored, and this one guards
a rule that must not be.

## What an error log carries

`accountIdOf` reads the account from the response when there is one and returns nothing when
there is not, so the error middleware can name the account without refusing anonymous
requests the way `accountOf` does. An error line now carries the correlation identifier and
the account identifier. It never carries the address: an account is named in a log by its
identifier.

## Why a failure blocks the pull request

The guard runs inside `npm test`, which is the `Tests et couverture` job. That job is not
itself a required check, but `Qualite (SonarCloud)` -- the one check `dev` requires -- is
declared `needs: tester`. A failing guard therefore stops the test job, SonarCloud never
runs, the required check never reports, and the pull request cannot be merged.

## Retention, checked rather than assumed

The register announces at most thirty days for logs. Vercel's own documentation, *Runtime
Logs*, section *Limits*, gives one hour on Hobby, one day on Pro, three days on Enterprise,
and thirty days at most with Observability Plus. No plan exceeds the announced duration, so
nothing is over-promised and no purge of ours is required. A change of plan, or a log drain
sending the lines to another tool, would bring the question back.
