-- Migration:  20260925120000_retention_purge
-- Purpose:    Apply the retention periods docs/gdpr/registre.md announces
--             (US-39, #40). purge_expired_data deletes notifications and
--             processed_events older than ninety days, and outbox rows
--             published more than seven days ago. An outbox row never
--             published is kept whatever its age: it is a fact nobody has been
--             told about yet, and deleting it would lose the effect.
--
--             Before this purge can run, erase_account has to find an
--             account's processed_events without the outbox, which the purge
--             empties after seven days (registre, T-05). It now also follows
--             notifications.event_id: every processed event is written in the
--             same transaction as the notification it produced, for the person
--             it notifies, so the link holds for as long as the notification
--             does, whatever the event's payload calls that person.
-- Reversible: yes
-- Rollback:
--   drop function if exists public.purge_expired_data(timestamptz);
--   drop index if exists public.outbox_published_at_idx;
--   drop index if exists public.notifications_created_at_idx;
--   drop index if exists public.processed_events_processed_at_idx;
--   -- erase_account reverts to the definition in
--   -- 20260925090000_preserve_shared_project_items_on_erasure.sql

-- The purge filters on these three columns. Without an index each pass reads
-- the whole table to find the few rows that have aged out.
create index outbox_published_at_idx
  on public.outbox (published_at)
  where published_at is not null;

create index notifications_created_at_idx
  on public.notifications (created_at);

create index processed_events_processed_at_idx
  on public.processed_events (processed_at);

-- Repeated from 20260925090000 unchanged, except for the processed_events
-- deletion that follows notifications. The outbox path stays: it covers an
-- event consumed without producing a notification, for the seven days its
-- outbox row lives. Past that, such a row is an identifier and an instant
-- that lead to nobody.
create or replace function public.erase_account(p_user_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.processed_events
  where event_id in (
    select id from public.outbox where payload ->> 'ownerId' = p_user_id::text
  );

  -- Deleting the processed event cascades to the notification, which the
  -- deletion of users below would have removed anyway.
  delete from public.processed_events
  where event_id in (
    select event_id from public.notifications where user_id = p_user_id
  );

  delete from public.outbox
  where payload ->> 'ownerId' = p_user_id::text;

  -- Must run before the project-deletion step below and before deleting
  -- users cascades away this account's memberships: both would otherwise
  -- remove the fact that this account was ever the sole owner, and a project
  -- that keeps other members would be left with none.
  --
  -- The member who has belonged the longest becomes the new owner. Written
  -- here for lack of a rule recorded anywhere else; revisit if the team
  -- settles a different one.
  update public.project_memberships new_owner
  set role = 'owner'
  where new_owner.user_id = (
    select other_membership.user_id
    from public.project_memberships other_membership
    where other_membership.project_id = new_owner.project_id
      and other_membership.user_id <> p_user_id
    order by other_membership.created_at
    limit 1
  )
    and new_owner.project_id in (
      select membership.project_id
      from public.project_memberships membership
      where membership.user_id = p_user_id
        and membership.role = 'owner'
        and not exists (
          select 1
          from public.project_memberships co_owner
          where co_owner.project_id = membership.project_id
            and co_owner.user_id <> p_user_id
            and co_owner.role = 'owner'
        )
        and exists (
          select 1
          from public.project_memberships other_member
          where other_member.project_id = membership.project_id
            and other_member.user_id <> p_user_id
        )
    );

  -- This must happen before deleting users: the membership foreign key
  -- cascades, after which there would be no way to distinguish a project that
  -- just lost its last member from an already ownerless project.
  delete from public.projects project
  where exists (
    select 1
    from public.project_memberships membership
    where membership.project_id = project.id
      and membership.user_id = p_user_id
  )
    and not exists (
      select 1
      from public.project_memberships other_membership
      where other_membership.project_id = project.id
        and other_membership.user_id <> p_user_id
    );

  -- Cascades to this account's remaining memberships and its own
  -- notifications. items.user_id is set to null rather than cascading: a
  -- shared project's tasks survive with an anonymous creator. Shared projects
  -- themselves survive because another membership still references them.
  delete from public.users where id = p_user_id;
end
$$;

-- One pass of the purge, one row per treatment with what it deleted. The
-- periods are written here rather than passed in: the registre is where they
-- are decided, and a caller able to shorten them could erase what the service
-- still needs. p_now exists for the tests, which cannot wait ninety days.
--
-- Notifications go first: deleting a processed event cascades to its
-- notification, and counting them afterwards would report under
-- processed_events what the notifications period removed. A second pass right
-- after the first finds nothing left to delete.
create function public.purge_expired_data(p_now timestamptz default now())
returns table (treatment text, deleted bigint)
language plpgsql
set search_path = ''
as $$
declare
  v_count bigint;
begin
  delete from public.notifications
  where created_at < p_now - interval '90 days';
  get diagnostics v_count = row_count;
  treatment := 'notifications';
  deleted := v_count;
  return next;

  delete from public.processed_events
  where processed_at < p_now - interval '90 days';
  get diagnostics v_count = row_count;
  treatment := 'processed_events';
  deleted := v_count;
  return next;

  delete from public.outbox
  where published_at is not null
    and published_at < p_now - interval '7 days';
  get diagnostics v_count = row_count;
  treatment := 'outbox';
  deleted := v_count;
  return next;
end
$$;

revoke execute on function public.purge_expired_data(timestamptz) from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.purge_expired_data(timestamptz) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.purge_expired_data(timestamptz) from authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.purge_expired_data(timestamptz) to service_role';
  end if;
end
$$;
