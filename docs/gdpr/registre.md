# Register of processing activities

What the application collects, why, for how long and for whom. One entry per processing activity,
kept up to date with every migration that adds or removes a field.

The register is the source: the privacy policy (`US-37`) rephrases it for a non-technical reader,
and the durations written here are the ones the automatic purge (`US-39`) applies. A duration that
changes is changed here first, then in `public.purge_expired_data`, which hard-codes it.

## Data controller

| | |
|---|---|
| **Controller** | Legacy 22 team (`Project-Legacy-22`) |
| **Contact** | Seïf Soltane — seif.soltane@epitech.eu |

The controller is the team, not a person: it is the team that decides the purposes and the means,
and the regulation designates the entity in that capacity, not one of its members. Seïf Soltane is
the point of contact, as the kickoff meeting recorded.

These two values are repeated as they are by the privacy policy (`US-37`). They change here first.

## Processors and location

The processing activities below name their recipients. This section says once and for all where
they are, because the "Location" column of each processing activity designates the table, not the
country.

| Processor | What it does | Where | Company |
|---|---|---|---|
| Supabase | database and authentication | Ireland, region `eu-west-1` | Supabase Inc., United States |
| Vercel | running the application and logs | Paris, region `cdg1`, set by `vercel.json` | Vercel Inc., United States |
| Grafana Cloud | monitoring: metrics and dashboards | Germany, region `prod-eu-west-2` | Grafana Labs, United States |
| Event queue (Upstash for Redis) | transport of the events between the API and the notification consumer | European Union; provisioned from the Vercel project | Upstash, Inc., United States |
| Have I Been Pwned | check for a compromised password | network of the provider | operated from Australia |

Everything is therefore stored and processed in the Union. That is not neutral for all that:
Supabase and Vercel are American companies, hence subject to the CLOUD Act, and an American
authority can compel them to disclose data that has never left Europe. It is an owned dependency,
not an oversight, and it is written in the privacy policy rather than left implicit.

What makes it reversible: the schema is described by versioned migrations, so any PostgreSQL
rebuilds it. What would have to be rewritten is what Supabase provides on top of SQL,
authentication and the row-level security policies. The full consequences are tracked by #273 and
#274.

Grafana Cloud receives no personal data, and it is a design constraint, not an observation:
ADR-0016 forbids labelling a metric with an account identifier, an address, a task title or an IP
address. What goes out is a counter or an aggregated duration.

**The event queue, on the other hand, does receive some — and it must be said precisely.** Each
task created sends two identifiers through it, that of the task and that of its owner, and nothing
else: no address, no title, no content. They are **pseudonymous** identifiers, and recital 26 of
the regulation is clear: pseudonymised data remains personal data as long as the controller can
re-identify it, which we can since `users.id` leads to the address.

The wording "no personal data crosses the bus" long appeared in the code and in this register. It
was too strong. What is true, and remains a good property, is that no **content** crosses it, and
that the identifiers are erased from it as soon as the notification is written. "No content" and
"nothing personal" are not the same sentence.

The queue is **Upstash for Redis**, store `upstash-kv-cyclamen-leaf`, created on 11 September 2026
and provisioned from the Storage tab of the Vercel project — Vercel is therefore the reseller, and
Upstash the operator. This adds one more American company to the list, with the same consequence
as for the three others: the CLOUD Act applies to the processor even when the region is European.

The plan is free, which for this entry does not raise the retention problem that
`docs/backup-and-exit.md` describes for the database: nothing is meant to stay there. An event
passes through it for the time of a delivery, and it is erased as soon as the notification is
written. An empty queue is the normal state; a queue that fills up is an incident, not a stock.

**Who has access, and it is the same everywhere.** The six developers of the team have the same
access to each of these tools. There is no separation of roles on access to the infrastructure, and
it is not a security measure that can be invoked: the privacy policy states it as it is, after
having announced for a time a more restricted access than it was.

Have I Been Pwned receives no personal data: five characters of a hash, which identify nobody, and
nothing is kept. It is listed for completeness.

## Processing activities

### T-01 — Account and authentication

| | |
|---|---|
| **Purpose** | Allow a person to create an account, sign in to it and find their data again from one session to the next |
| **Legal basis** | Performance of the contract: without an account, the service cannot be provided |
| **Data subjects** | Registered users |
| **Data categories** | Email address; password hash; creation and modification timestamps; session tokens; version of the privacy policy accepted and date of that acceptance |
| **Location** | `auth.users` (Supabase Auth), mirrored into `public.users` by a trigger |
| **Retention** | The whole life of the account, then immediate erasure when it is deleted (`US-13`) |
| **Recipients** | Vercel (processor, application hosting: the Express API runs as a Vercel function, `vercel.json` routes `/auth` and `/items` to it, so the body of the requests and responses passes through it in clear) ; Supabase (processor, persistence and authentication) |
| **Security measures** | Password hashed by Supabase Auth, never stored or logged in clear; session in an `httpOnly` and `SameSite=Lax` cookie; RLS policies restricting each row to its owner; rate limiting on registration and sign-in |

The record of consent (`policy_version`, `policy_accepted_at`) is written by the mirror trigger, in
the transaction that creates the account. It is kept as long as the account: it is what allows
saying what the person consented to on the day the text changes, and erasing it would mean losing
the evidence we must be able to produce.

`public.users` only duplicates `id` and `email`. The mirror exists because `items.user_id` must
reference a table of the `public` schema; the email is repeated there because the personal data
export returns it.

Leaving Supabase transfers this data (#426): `npm run data:export` writes, for each target engine,
a `<target>-accounts.sql` file that carries the identifier, the address, the bcrypt hash and the
confirmation date of each account. The session tokens and the audit log of GoTrue do not cross.
This file and the dump it comes from are personal data just like a backup: written into
`data-out/`, which `.gitignore` excludes, and to be deleted once applied. The transfer changes
neither the purpose nor the legal basis; the new host becomes a recipient and must be added above
on the day it is chosen.

### T-02 — Check for compromised passwords

| | |
|---|---|
| **Purpose** | Refuse a password that appears in a known breach, during a reset |
| **Legal basis** | Legitimate interest: protect the accounts against credential reuse |
| **Data subjects** | Users resetting their password |
| **Data categories** | The first five characters of a SHA-1 hash of the candidate password |
| **Location** | None. Nothing is stored: the hash is a lookup key, computed then discarded |
| **Retention** | Not applicable |
| **Recipients** | Have I Been Pwned (Pwned Passwords API), reached from the outgoing network of Vercel (processor, application hosting) |
| **Security measures** | k-anonymity: only a five-character prefix leaves the process, the comparison is done locally; `Add-Padding` header so that the size of the response reveals nothing; two-second timeout, a failure does not block the reset |

The prefix does not allow finding the password, but the call is a communication to a third party:
it appears here for that reason.

### T-03 — Tasks

| | |
|---|---|
| **Purpose** | Create, view, modify and delete one's own tasks |
| **Legal basis** | Performance of the contract: it is the service itself |
| **Data subjects** | Registered users |
| **Data categories** | Title entered by the user; progress column of the Kanban; priority; optional due date; owner and project it belongs to; members of the project the task is assigned to, none or several (US-58, #419); creation and modification timestamps |
| **Location** | `public.items`, and `public.item_assignees` for the assignments |
| **Retention** | None: a deletion requested by the user erases the row immediately, as does the deletion of a project of which they were the last member. When the account is deleted: a task of a project where they were alone disappears with the project; a task of a shared project is kept for the other members, the link to the deleted account being broken (`items.user_id` set to `null`, #425). The assignment disappears with the membership of the person assigned: removing them from the project or erasing their account removes them from the assignees, and the task stays |
| **Recipients** | Vercel (processor, application hosting: the Express API runs as a Vercel function, `vercel.json` routes `/auth` and `/items` to it, so the body of the requests and responses passes through it in clear) ; Supabase (processor, persistence) |
| **Security measures** | RLS policies per owner; every read names an owner; the title never goes out in a log or in an event |

The title is free content: it can contain any personal data, including sensitive data, without the
application being able to anticipate it. This is what makes immediate erasure preferable to a grace
period: a deleted task survives nowhere, and there is no window during which data the user wanted
to remove remains readable.

Soft deletion existed until the migration `20260909123004_remove_item_soft_deletion`: the
`deleted_at` column disappeared with it, and no row is marked any more rather than removed.

### T-04 — Notifications

| | |
|---|---|
| **Purpose** | Tell a person that one of their tasks was created |
| **Legal basis** | Performance of the contract, like the service they accompany |
| **Data subjects** | Registered users |
| **Data categories** | Identifiers of the recipient, of the task and of the originating event; read date; timestamps |
| **Location** | `public.notifications` |
| **Retention** | Ninety days after creation, then erasure by the daily purge (see "Automatic purge" below). Immediate when the account is deleted |
| **Recipients** | Vercel (processor, application hosting: the Express API runs as a Vercel function, `vercel.json` routes `/auth` and `/items` to it, so the body of the requests and responses passes through it in clear) ; Supabase (processor, persistence) |
| **Security measures** | No label stored: the text displayed is built by the interface, the table only contains identifiers |

### T-05 — Event queue

| | |
|---|---|
| **Purpose** | Guarantee that a recorded fact is announced once and only once to the components that depend on it |
| **Legal basis** | Legitimate interest: technical reliability of the service |
| **Data subjects** | Registered users, indirectly |
| **Data categories** | Event identifier, versioned name, instant, and a payload restricted to identifiers (`itemId`, `ownerId`) |
| **Location** | `public.outbox`, `public.processed_events`, and the Redis queue during transport |
| **Retention** | `outbox`: seven days after publication (`published_at`). An event never published (`published_at is null`) is not purged: it represents a written fact nobody has been told about yet, and deleting it would lose the effect instead of delaying it. `processed_events`: ninety days from its creation, that is from consumption, which makes a replay have no effect during that period. The Redis queue keeps nothing: a message leaves it as soon as it is read, and the broker is not persistent |
| **Recipients** | Vercel (processor, application hosting: the Express API runs as a Vercel function, `vercel.json` routes `/auth` and `/items` to it, so the body of the requests and responses passes through it in clear) ; Supabase (processor, persistence of the outbox and of the processed events). The Redis broker is run by the team and is not a distinct third party; if it were one day hosted, it would join this entry |
| **Security measures** | The event contract forbids any personal data in the payload, and a test fails if the title of a task is found in it; strict schema, an added field is rejected |

An event only carries identifiers, and `ownerId` is one of them: it designates an account, so it
remains linkable to a person. It is **minimisation**, not anonymisation — the CNIL distinguishes
the two, and a pseudonymous identifier remains personal data.

**Erasure therefore deletes them, and already does.** `account_erasure.sql` removes the rows of
`public.outbox` whose `payload ->> 'ownerId'` designates the account, and the corresponding rows of
`public.processed_events`.

**The trade-off the purge imposed is settled (`US-39`).** Erasure found the `processed_events` of
an account **through the outbox**, a path that a purge at D+7 deletes: an account deletion at D+8
would have left the processing traces in place. Since the migration
`20260925120000_retention_purge`, `erase_account` also finds them **through the notification** they
produced: each processed event is written in the same transaction as its notification, for the
person notified (`notifications.user_id`). This path holds for every event, whatever name their
payload gives the recipient (`ownerId`, `memberId`), and it lasts as long as the notification. No
column was added.

What remains out of reach of erasure, and why it is not personal data: a processed event without a
notification, once its outbox is purged, comes down to a random identifier and an instant, which
nothing links to an account any more. The purge removes it at ninety days like the others.

**Portability, for its part, excludes them**, and for a reason of its own: the right covers the
data the person provided or that concerns them, not the technical traces their processing
produces. An event identifier and a publication instant teach them nothing about themselves; the
object they point to — the task — is returned by `T-03`. This exclusion does not depend on the
minimisation argument above.

### T-06 — Application logs

| | |
|---|---|
| **Purpose** | Diagnose a failure and detect abuse |
| **Legal basis** | Legitimate interest: keeping the service operational |
| **Data subjects** | Any person issuing a request, registered or not |
| **Data categories** | Method, path called, response code, duration, correlation identifier. The path can contain the identifier of a task |
| **Location** | Standard output of the processes, collected by the host |
| **Retention** | Thirty days at most. These are not rows of our database: the host retains them according to the plan of the project, one hour on the Hobby plan, one day on Pro, thirty days at most with Observability Plus (Vercel documentation, *Runtime Logs*, *Limits* section). No plan exceeds the announced duration, so no purge is needed on our side; a change of plan or a log drain to another tool would bring it back here |
| **Recipients** | Vercel (processor, runtime logs). Its edge logs record the IP address of the client whatever our log line contains, which is a purpose and a duration distinct from the application hosting above |
| **Security measures** | Masking of the request body, of the authorization header, of the cookie and of any field named `password`; neither an email address nor a task title is logged, which a test checks |

### T-07 — Projects and membership

| | |
|---|---|
| **Purpose** | Group tasks and share them between several accounts |
| **Legal basis** | Performance of the contract: grouping is the function requested |
| **Data subjects** | Registered users, members of at least one project |
| **Data categories** | Title of the project, chosen by the user and able to contain whatever they want; identifier of the member account; role (`owner` or `member`); creation and update timestamps |
| **Location** | `public.projects` and `public.project_memberships` |
| **Retention** | The whole life of the project. When an account is deleted, its memberships go, and a project of which it was the last member is deleted with its tasks; a project still shared remains |
| **Recipients** | Vercel (processor, application hosting) ; Supabase (processor, persistence) |
| **Security measures** | RLS policies restricting each project to its members; membership is checked before any read or write of a task; a non-member receives the same absence as for a project that does not exist, which does not reveal that a project exists |

A shared project had an unwanted consequence, corrected by `#425`: **a member who erased their
account made their tasks disappear from the projects the others kept using.** This is no longer the
case since the migration `20260925090000`: the tasks of a shared project are kept, with the link to
the account broken rather than the row removed — only the title, entered by the person, remains
visible to the other members, never their identity. If the erased account was the only owner of a
project that remained shared, ownership is transferred to the oldest member, so that the project
keeps someone able to invite or remove a member. The privacy policy (`US-37`) and the account
deletion screen say so.

### T-08 — Password reset email

| | |
|---|---|
| **Purpose** | Allow a person who can no longer sign in to regain control of their account |
| **Legal basis** | Performance of the contract: without this channel, a forgotten password makes the account inaccessible |
| **Data subjects** | Users requesting a reset |
| **Data categories** | Email address, and a single-use recovery token sent in the message |
| **Location** | None on our side. The token is issued and checked by Supabase Auth; the message goes to the mailbox of the recipient |
| **Retention** | The token expires on the provider side and is single-use. The message lives in the mailbox of the recipient, out of our reach |
| **Recipients** | Supabase (processor, sending the message) and the configured SMTP provider. In development, the mail catcher of the local stack; in production, no SMTP is provisioned yet (#164) |
| **Security measures** | The response of the API is identical whether or not the address has an account, so the request does not reveal who is registered; the token exchange happens entirely on the server side; the link is never logged |

It is the only processing activity where personal data **goes out to a third party that is neither
Vercel nor Supabase**. ADR-0010 decided this channel; the choice of the production provider remains
open and will have to come back here.

### T-09 — Rate limiting

| | |
|---|---|
| **Purpose** | Refuse a brute-force attack on registration, sign-in and reset requests, and bound the probing of registered addresses through invitations (`T-10`) |
| **Legal basis** | Legitimate interest: protect the accounts against the systematic trial of credentials |
| **Data subjects** | Any person issuing a request, registered or not |
| **Data categories** | IP address of the caller, the only key of the counter of the public routes; identifier of the account for invitations, which require a session |
| **Location** | Memory of the process, in a table cleared at restart |
| **Retention** | The duration of the window, from five minutes to one hour depending on the route, then the key is removed |
| **Recipients** | None. The value does not leave the process |
| **Security measures** | Never logged — `request-log.ts` records no address, which a test checks — never persisted, never transmitted. `TRUST_PROXY` determines how many proxy hops are trusted to derive it, and a wrong value would make every visitor share the same counter |

### T-10 — Invitations into a project

| | |
|---|---|
| **Purpose** | Offer a person to join a project, and let them accept or decline |
| **Legal basis** | Performance of the contract: sharing a project is the function requested, and joining depends on the agreement of the invited person |
| **Data subjects** | Registered users: the person who invites and the invited person |
| **Data categories** | Identifiers of the project, of the invited person and of the person who invites; state of the invitation (`pending`, `accepted`, `declined`); creation and response dates. The address of the person who invites is shown to the invited person, read on demand and never copied, or absent if that account has since been erased |
| **Location** | `public.project_invitations`, and the `invitation_id` column of `public.notifications` |
| **Retention** | The whole life of the project. A handled invitation stays so that the history says who declined; it goes with the project or with the account of the invited person. Erasing the account of the person who invites no longer removes it (`#425`, `ADR-0021`): only `invited_by` becomes `null`, and the notification produced for the invited person remains readable |
| **Recipients** | Vercel (processor, application hosting) ; Supabase (processor, persistence) |
| **Security measures** | Only an owner of the project invites; only the invited person reads and answers their invitation, the other accounts receive the same absence as for an invitation that does not exist; the address entered is neither logged nor placed in the event; twenty invitations per account per quarter of an hour bound the use of the route to test which addresses have an account |

Inviting answers "no account carries this address" when that is the case, so that the person who
invites corrects a typo. The route therefore reveals that an address is registered, to an
authenticated account and within the limit of its budget. This choice is owned: a silent refusal
would let an invitation go to nobody without its author knowing.

## Automatic purge

`public.purge_expired_data` applies the durations of `T-04` and `T-05`, in one transaction:

| Processing activity | What is deleted |
|---|---|
| `notifications` | the rows created more than ninety days ago |
| `processed_events` | the rows processed more than ninety days ago |
| `outbox` | the rows published more than seven days ago; a row never published is never deleted |

The `purge` workflow calls it once a day through `POST /internal/purge` (`docs/ci.md`). Each pass
writes, in the summary of its run and in the API logs, the date, the processing activity and the
number of rows deleted, without any identifier. A second pass right after the first deletes
nothing. `T-06` is not included: its logs are not in our database.

## What the register does not cover yet

Nothing. The ten processing activities above cover every table of the schema, every outgoing call
and every piece of data held in memory by the process.

## Fields without an identified purpose

Each persisted column has been attached to a processing activity above. None was left without a
purpose, so no field deletion is required by this issue.

The case examined closely is `public.users.email`, which duplicates `auth.users.email`. It is kept:
the mirror is what allows `items.user_id` to reference an account, and the email is needed there
for the personal data export, which must return the address without depending on a call to the
authentication API.

## Decisions to ratify

Each duration above was checked against the schema in force, not against that of sprint 1: a
duration the code does not practise is worse than a missing duration, since it asserts a retention
that does not exist. Since `US-39`, each one is applied by the automatic purge or by the host, and
the constraint `T-05` placed on the purge is lifted. Three points need a confirmation from the team
at review:

1. **The Supabase hosting region.** An instance outside the European Union requires a framework
   for the transfers, which must then be described here. It is the only point that can still
   change the content of a processing activity.
2. **The durations themselves.** The kickoff record proposed "indefinitely unless the user asks".
   That is not tenable: storage limitation is a principle of the regulation, and an indefinite
   duration cannot be written in a register. The values chosen here are those that seem
   proportionate to each purpose; the team can lengthen or shorten them, not remove them.
