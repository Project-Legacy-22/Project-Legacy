-- Migration:  20260904110000_outbox_and_notifications
-- Purpose:    Give US-10 the three tables its event flow needs. `outbox` holds
--             events written in the same transaction as the fact they announce,
--             so neither can exist without the other. `processed_events` lets a
--             consumer recognise what it has already handled, which is what
--             makes a redelivery a no-op. `notifications` is the observable
--             effect the flow produces. Also adds the function the API calls to
--             write an item and its event atomically: PostgREST sends one
--             statement per request, so two inserts from the application would
--             be two transactions.
-- Reversible: yes
-- Rollback:
--   drop function if exists public.create_item_with_event(uuid, uuid, text, uuid, text, timestamptz, jsonb);
--   drop trigger if exists notifications_set_updated_at on public.notifications;
--   drop table if exists public.notifications;
--   drop table if exists public.processed_events;
--   drop table if exists public.outbox;

-- The transactional outbox. A row is written by the same statement as the fact
-- it announces; a relay publishes it to the broker afterwards and stamps
-- published_at. The broker is a transport, not a guarantee of atomicity
-- (ADR-0007): without this table, a publication that succeeds while the
-- transaction rolls back would announce an item that does not exist.
create table public.outbox (
  id           uuid        primary key,
  name         text        not null,
  occurred_at  timestamptz not null,
  payload      jsonb       not null,
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  -- The versioned event name of docs/events/catalog.md, for example
  -- item.created.v1. Checked here so a producer cannot write an event the
  -- catalogue does not describe.
  constraint outbox_name_format_chk check (name ~ '^[a-z]+\.[a-z]+\.v[0-9]+$')
);

-- The relay only ever reads what it has not published yet. A partial index
-- keeps that query on the rows that matter instead of the whole history.
create index outbox_unpublished_idx
  on public.outbox (occurred_at)
  where published_at is null;

-- What a consumer has already handled. The event identifier is the primary key,
-- so a second delivery of the same event conflicts instead of being applied
-- twice. Idempotence lives here rather than in each consumer's logic, where it
-- would have to be reimplemented and could be forgotten.
create table public.processed_events (
  event_id     uuid        primary key,
  processed_at timestamptz not null default now()
);

-- The effect a user can see. Carries no message text: the wording belongs to
-- the interface, and storing it would freeze today's phrasing into every row
-- and duplicate content that lives in items.
create table public.notifications (
  id         uuid        primary key default public.uuid_generate_v7(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  item_id    uuid        not null references public.items (id) on delete cascade,
  -- The event that produced this notification: it carries the uniqueness rule
  -- below and traces an effect back to its cause when diagnosing.
  event_id   uuid        not null references public.processed_events (event_id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One notification per event, not per delivery. Should a redelivery slip past
  -- processed_events, the database still refuses the duplicate.
  constraint notifications_event_id_key unique (event_id)
);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function public.set_updated_at();

-- Unread notifications of one user, most recent first: what the interface asks
-- for on every page load.
create index notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- Writes the item and the event announcing it in a single transaction. A
-- function body is one transaction, so either both rows exist or neither does.
-- Splitting this into two calls from the application would reintroduce exactly
-- the window this table was created to close.
--
-- The event is passed in rather than built here: the domain owns the shape of
-- what it announces (docs/events/catalog.md), and a payload assembled in SQL
-- would be a second definition of it, free to drift from the first.
create function public.create_item_with_event(
  p_item_id     uuid,
  p_user_id     uuid,
  p_name        text,
  p_event_id    uuid,
  p_event_name  text,
  p_occurred_at timestamptz,
  p_payload     jsonb
) returns void
language plpgsql
-- Empty search_path: every identifier below is schema-qualified, so nothing is
-- resolved through a path the caller controls.
set search_path = ''
as $$
begin
  insert into public.items (id, user_id, name)
  values (p_item_id, p_user_id, p_name);

  insert into public.outbox (id, name, occurred_at, payload)
  values (p_event_id, p_event_name, p_occurred_at, p_payload);
end
$$;

-- Same posture as the initial migration: the backend connects with the
-- service-role key, which bypasses row-level security, and ownership is
-- enforced in the application layer. RLS stays enabled so PostgREST exposes
-- nothing to the anon and authenticated roles. Policies arrive with US-11.
alter table public.outbox enable row level security;
alter table public.processed_events enable row level security;
alter table public.notifications enable row level security;
