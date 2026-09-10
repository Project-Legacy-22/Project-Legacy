-- Migration:  20260910100000_notification_policies_and_pagination
-- Purpose:    US-18 gives notifications a real screen: a paginated list and a
--             mark-as-read action, the first things besides the backend's
--             service-role key to read or write this table. It needs an index
--             that serves every notification in order, not only the unread
--             ones the existing partial index was built for, the row-level
--             security policies the outbox migration deferred ("Policies
--             arrive with US-11", which only ever covered items), and a
--             function that makes marking as read idempotent in one
--             round trip instead of a read followed by a conditional write.
-- Reversible: yes
-- Rollback:
--   drop function if exists public.mark_notification_read(uuid, uuid);
--   drop policy if exists notifications_update_own on public.notifications;
--   drop policy if exists notifications_select_own on public.notifications;
--   drop index if exists notifications_user_id_created_at_all_idx;

-- The page order for US-18's list: every notification of one user, most
-- recent first, read or not. notifications_user_id_created_at_idx (the
-- partial index from the outbox migration) only covers the unread ones, which
-- is what the session banner's count needed and nothing else.
create index notifications_user_id_created_at_all_idx
  on public.notifications (user_id, created_at desc, id desc);

-- Same posture as items: the backend enforces ownership with the service-role
-- key, and these policies are the second line of defense for PostgREST
-- reached directly with an anon key and a user's own token (see
-- row-level-security.integration.test.ts).
--
-- No insert or delete policy: a notification is only ever created by
-- record_item_created_notification (SECURITY DEFINER, bypasses RLS) and only
-- ever removed by the cascade from users or items being deleted. Neither is
-- something a signed-in caller does directly, so PostgREST grants neither.
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Marking as read is the only write US-18 exposes. The policy does not pin
-- which columns may change -- Postgres RLS cannot express that -- but it does
-- pin the row to the caller's own, exactly like items_update_own: the
-- application layer is what actually restricts the write to read_at.
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- One statement rather than a read to decide whether to write: two calls
-- would be two round trips and a window in which a concurrent call could
-- read the same "not yet read" state, exactly the race notify_in_one_transaction
-- closed for creating a notification in the first place. coalesce leaves an
-- already-set read_at untouched, which is what makes a second call a no-op
-- instead of moving the timestamp forward.
--
-- Returns true when the row exists and belongs to the caller, whether this
-- call is what set read_at or it was already set; false when there is no such
-- row for this account, which the application turns into NotificationNotFound.
create function public.mark_notification_read(
  p_id         uuid,
  p_account_id uuid
) returns boolean
language plpgsql
-- Empty search_path: every identifier below is schema-qualified, so nothing is
-- resolved through a schema the caller controls.
set search_path = ''
as $$
declare
  v_found boolean;
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_id and user_id = p_account_id
  returning true into v_found;

  return coalesce(v_found, false);
end
$$;
