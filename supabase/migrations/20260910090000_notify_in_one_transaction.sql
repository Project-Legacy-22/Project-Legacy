-- Migration:  20260910090000_notify_in_one_transaction
-- Purpose:    Close the gap the consumer left open. Claiming an event in
--             processed_events and creating its notification were two
--             statements, so two transactions: if the claim succeeded and the
--             insert then failed for any reason other than a duplicate, the
--             event was already off the queue and every later redelivery hit
--             the existing claim, returned "already handled", and the
--             notification was never created. The effect was lost silently,
--             which is precisely what the claim was meant to prevent.
--             Both writes now happen inside one function body, so either the
--             event is claimed and its notification exists, or neither does and
--             a redelivery still has work to do.
-- Reversible: yes.
-- Rollback:
--   drop function if exists public.record_item_created_notification(uuid, uuid, uuid);

-- Returns true when this call is the one that applied the effect, false when
-- the event had already been handled. The distinction belongs here rather than
-- in the caller: it is the unique violation on the primary key that decides,
-- and reading before writing would let two workers both pass the read.
create function public.record_item_created_notification(
  p_event_id uuid,
  p_user_id  uuid,
  p_item_id  uuid
) returns boolean
language plpgsql
-- Empty search_path: every identifier below is schema-qualified, so nothing is
-- resolved through a schema the caller controls.
set search_path = ''
as $$
begin
  insert into public.processed_events (event_id)
  values (p_event_id);

  insert into public.notifications (event_id, user_id, item_id)
  values (p_event_id, p_user_id, p_item_id);

  return true;
exception
  -- Raised by the claim above when the event was already handled. Both inserts
  -- are undone together, which is what makes a redelivery a no-op rather than a
  -- half-applied effect.
  when unique_violation then
    return false;
end
$$;
