-- Migration:  20260903120000_initial_schema
-- Purpose:    Replace the schema the application used to create at startup with a
--             versioned one. Adds primary keys, foreign keys, checks and
--             indexes the inherited todo_items table never had, an owner column
--             on every row of user data, and UTC timestamps. Seeds the
--             single-user system account so items.user_id can be NOT NULL before
--             US-11 introduces real accounts.
-- Reversible: yes. The Supabase CLI applies migrations up-only; this header is
--             the rollback of record (see docs/adr/0005). `supabase db reset`
--             replays from empty locally.
-- Rollback:
--   drop trigger if exists items_set_updated_at on public.items;
--   drop trigger if exists users_set_updated_at on public.users;
--   drop table if exists public.items;
--   drop table if exists public.users;
--   drop function if exists public.set_updated_at();
--   drop function if exists public.uuid_generate_v7();

-- UUID v7: time-ordered identifiers, so primary keys sort by creation and no id
-- can be guessed from another. PostgreSQL gains a native uuidv7() in 18 and
-- Supabase does not ship the pg_uuidv7 extension, so the function is defined
-- here. Implementation from the widely-used community snippet
-- (https://gist.github.com/kjmph/5bd772b2c2df145aa645b837da7eca74); replace with
-- the native call once the database is on PostgreSQL 18.
create function public.uuid_generate_v7() returns uuid
language plpgsql volatile
-- Empty search_path: every function called below is a pg_catalog builtin, which
-- stays resolvable, and nothing is looked up in a caller-controlled schema.
set search_path = ''
as $$
begin
  return encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
          from 1 for 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex')::uuid;
end
$$;

-- One trigger function, reused by every table that has updated_at.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create table public.users (
  id         uuid        primary key default public.uuid_generate_v7(),
  email      text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_key unique (email)
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create table public.items (
  id         uuid        primary key default public.uuid_generate_v7(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  name       text        not null,
  completed  boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- 255 mirrors MAX_ITEM_NAME_LENGTH in packages/contracts and packages/core/items.
  constraint items_name_length_chk check (char_length(name) between 1 and 255)
);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- Every user-owned table carries a user_id index (US-11 -> RGPD).
create index items_user_id_idx on public.items (user_id);
-- Supports the per-owner, most-recent-first listing of US-12 and keeps
-- soft-deleted rows out of the hot path.
create index items_user_id_created_at_idx
  on public.items (user_id, created_at desc)
  where deleted_at is null;

-- The single-user system account (D-20). Keep this id in sync with
-- SYSTEM_USER_ID in apps/api/src/composition-root.ts. This is a functional
-- fixture the items.user_id foreign key depends on, not demo data, so it lives
-- in the migration and not in supabase/seed.sql (which never runs on a remote).
insert into public.users (id, email)
values ('00000000-0000-7000-8000-000000000001', 'system@localhost')
on conflict (id) do nothing;

-- The backend connects with the service-role key, which bypasses row-level
-- security; ownership is enforced in the application layer. RLS is still enabled
-- so PostgREST exposes nothing to the anon and authenticated roles and the
-- Supabase linter stays quiet. Policies arrive with US-11.
alter table public.users enable row level security;
alter table public.items enable row level security;
