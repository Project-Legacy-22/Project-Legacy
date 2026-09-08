-- Migration:  20260908120000_account_erasure
-- Purpose:    Decide what an erasure removes and in which order (US-13). The
--             authentication migration deliberately left that decision open: it
--             mirrors auth.users on insert and on email change and never on
--             delete, so that a cascade written there would not settle it
--             silently. This is where it is settled.
--
--             Erasure is physical rather than a deleted_at
--             (standards/01-architecture.md section 5): a soft delete on
--             personal data keeps the personal data. It is also a single
--             transaction. A function body is one transaction and PostgREST
--             opens one per request, so the three statements below sent from
--             the application would be three of them, and a failure in between
--             would leave an account half erased with nothing recording how far
--             it got.
-- Reversible: no, and that is the feature. What this removes is gone; restoring
--             an account erased by mistake means restoring a backup of the
--             whole database. The confirmation the API demands before calling
--             it is what stands in for a rollback.
-- Rollback:
--   drop function if exists public.erase_account(uuid);
--   drop index if exists public.outbox_owner_id_idx;

-- The account an outbox row belongs to. An event payload carries identifiers
-- and nothing else (docs/events/catalog.md), so ownerId is the only place an
-- account appears in this table. The functional index turns the two passes
-- below into index lookups instead of scans of an event history that only ever
-- grows.
create index outbox_owner_id_idx on public.outbox ((payload ->> 'ownerId'));

-- Removes everything one account owns. Calling it twice is not an error: a
-- caller whose erasure failed halfway has to be able to ask again, and the
-- second call finds nothing left to remove.
--
-- Credentials and sessions are deliberately not touched here. They live in
-- auth.users, which the API deletes through the GoTrue admin endpoint once this
-- function returns: deleting that row directly would leave GoTrue's own session
-- and refresh-token tables behind, and revoking the sessions is the point.
create function public.erase_account(p_user_id uuid) returns void
language plpgsql
-- Empty search_path: every identifier below is schema-qualified, so nothing is
-- resolved through a path the caller controls.
set search_path = ''
as $$
begin
  -- processed_events first. notifications.event_id references it on delete
  -- cascade, so this also removes the notifications those events produced.
  -- Deleting the account row further down would remove them anyway; doing it
  -- here is what clears processed_events itself, which carries no user_id and
  -- would otherwise outlive the account whose events it recorded.
  --
  -- The rows are selected by the events this account produced, not by the
  -- notifications it received. The two sets are the same today because an item
  -- only ever notifies its owner. They stop being the same when a project is
  -- shared (US-16, US-18): an event of this account will then have produced a
  -- notification for somebody else, and this statement would take it away with
  -- it. Handling that belongs to the story that introduces the sharing, not to
  -- this one, which has no shared row to reason about.
  delete from public.processed_events
  where event_id in (
    select id from public.outbox where payload ->> 'ownerId' = p_user_id::text
  );

  delete from public.outbox
  where payload ->> 'ownerId' = p_user_id::text;

  -- Cascades to items and to any remaining notifications: both reference
  -- users (id) on delete cascade.
  delete from public.users where id = p_user_id;
end
$$;
