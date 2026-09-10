-- Migration:  20260904103000_authentication_and_row_level_security
-- Purpose:    Turn the placeholder ownership of the initial schema into real
--             ownership. Supabase Auth owns credentials and sessions
--             (docs/adr/0008), so auth.users is the source of truth for
--             identity and public.users becomes a mirror of it, kept by a
--             trigger. Without that mirror, items.user_id cannot reference the
--             account a session designates. Also adds the row-level security
--             policies the initial migration announced for US-11: enabling RLS
--             with no policy denies everything, which is safe but means no
--             policy has ever been exercised.
-- Reversible: yes.
-- Rollback:
--   drop policy if exists items_delete_own on public.items;
--   drop policy if exists items_update_own on public.items;
--   drop policy if exists items_insert_own on public.items;
--   drop policy if exists items_select_own on public.items;
--   drop policy if exists users_select_self on public.users;
--   drop trigger if exists on_auth_user_changed on auth.users;
--   drop function if exists public.mirror_auth_user();

-- Mirroring in the database rather than in the API means every path that
-- creates a user reaches the same state: our endpoint, a future OAuth provider,
-- an administrator acting in the dashboard. It also means a failure to mirror
-- aborts the account creation instead of leaving a session that points at a
-- user the application cannot see.
--
-- security definer: the role that inserts into auth.users has no rights on
-- public.users, so the trigger runs as the function owner. The search_path is
-- empty and every name below is schema-qualified, so nothing resolves through a
-- schema the caller controls.
create function public.mirror_auth_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end
$$;

-- On email change too, so the mirror does not drift the day US-36 lets someone
-- change their address. Deletion is deliberately not mirrored: what an erasure
-- removes, and in which order, is US-13's decision, and a cascade written here
-- would make that decision silently.
create trigger on_auth_user_changed
  after insert or update of email on auth.users
  for each row execute function public.mirror_auth_user();

-- The API reaches the database with the service-role key, which bypasses
-- row-level security, and enforces ownership in the application layer. These
-- policies are what stands between a leaked public key and every user's data,
-- and what the browser would be subject to if the front ever queried PostgREST
-- directly.
--
-- (select auth.uid()) rather than auth.uid(): wrapped in a subquery it is
-- evaluated once per statement instead of once per row, and the planner can
-- then use the user_id indexes the initial migration created.
create policy users_select_self on public.users
  for select to authenticated
  using (id = (select auth.uid()));

create policy items_select_own on public.items
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy items_insert_own on public.items
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy items_update_own on public.items
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy items_delete_own on public.items
  for delete to authenticated
  using (user_id = (select auth.uid()));
