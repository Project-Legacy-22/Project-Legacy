-- Migration: 20260924140000_item_assignees
-- Purpose: Assign a task to several members of its project, from its creation
--          on (#419). Replaces the single items.assignee_id of #348.
-- Reversible: yes. Drop set_item_assignees, restore create_item_with_event
--             from 20260923120000, drop the table and the unique constraint.
--             Assignments beyond the first per task are lost with it.
--
-- items.assignee_id stays, unread, until the release that stops reading it:
-- a column the production code still selects is not dropped under it
-- (ADR-0019). Its removal is a migration of its own.

-- The target of the key below: a task and its project, together.
alter table public.items
  add constraint items_id_project_key unique (id, project_id);

create table public.item_assignees (
  item_id    uuid not null,
  project_id uuid not null,
  user_id    uuid not null,
  constraint item_assignees_pkey primary key (item_id, user_id),
  -- The assignment belongs to the task, in the task's project: deleting the
  -- task deletes it.
  constraint item_assignees_item_fkey foreign key (item_id, project_id)
    references public.items (id, project_id) on delete cascade,
  -- And to a membership, as #348's column did: only a member can be
  -- assigned, and removing the member, erasing the account or deleting the
  -- project removes the assignment -- the row, not the task.
  constraint item_assignees_membership_fkey foreign key (project_id, user_id)
    references public.project_memberships (project_id, user_id) on delete cascade
);

-- The referencing side of the membership key: removing a member finds their
-- assignments without scanning the project.
create index item_assignees_membership_idx on public.item_assignees (project_id, user_id);

-- Same posture as items: a session reads the assignments of the projects it
-- belongs to; the API goes through the service role.
alter table public.item_assignees enable row level security;

create policy item_assignees_select_project_member on public.item_assignees
  for select to authenticated
  using (
    exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = item_assignees.project_id
        and membership.user_id = (select auth.uid())
    )
  );

insert into public.item_assignees (item_id, project_id, user_id)
select id, project_id, assignee_id
from public.items
where assignee_id is not null;

-- Creation writes the task, its assignees and its event in one transaction.
-- The new parameter has a default, so a caller that does not know it --
-- the code already deployed when this runs -- still matches.
drop function public.create_item_with_event(
  uuid, uuid, uuid, text, public.item_priority, date, uuid, text, timestamptz, jsonb
);

create function public.create_item_with_event(
  p_item_id uuid, p_user_id uuid, p_project_id uuid, p_name text,
  p_priority public.item_priority, p_due_date date, p_event_id uuid,
  p_event_name text, p_occurred_at timestamptz, p_payload jsonb,
  p_assignee_ids uuid[] default '{}'
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.items (id, user_id, project_id, name, priority, due_date, position)
  values (p_item_id, p_user_id, p_project_id, p_name, p_priority, p_due_date, p_item_id);

  insert into public.item_assignees (item_id, project_id, user_id)
  select distinct p_item_id, p_project_id, assignee
  from unnest(p_assignee_ids) as assignee;

  insert into public.outbox (id, name, occurred_at, payload)
  values (p_event_id, p_event_name, p_occurred_at, p_payload);
end
$$;

-- Replaces the whole list in one transaction: the list the person saw and
-- edited is the list that is stored, not a merge with another request's.
create function public.set_item_assignees(
  p_item_id uuid, p_project_id uuid, p_assignee_ids uuid[]
) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.item_assignees
  where item_id = p_item_id and not (user_id = any (p_assignee_ids));

  insert into public.item_assignees (item_id, project_id, user_id)
  select distinct p_item_id, p_project_id, assignee
  from unnest(p_assignee_ids) as assignee
  on conflict (item_id, user_id) do nothing;
end
$$;

revoke execute on function public.create_item_with_event(uuid, uuid, uuid, text, public.item_priority, date, uuid, text, timestamptz, jsonb, uuid[]) from public;
revoke execute on function public.set_item_assignees(uuid, uuid, uuid[]) from public;

-- Only the service role calls these; the use cases check membership first,
-- and the keys above check it again.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.create_item_with_event(uuid, uuid, uuid, text, public.item_priority, date, uuid, text, timestamptz, jsonb, uuid[])',
    'public.set_item_assignees(uuid, uuid, uuid[])'
  ] loop
    if to_regrole('anon') is not null then
      execute format('revoke execute on function %s from anon', signature);
    end if;
    if to_regrole('authenticated') is not null then
      execute format('revoke execute on function %s from authenticated', signature);
    end if;
    if to_regrole('service_role') is not null then
      execute format('grant execute on function %s to service_role', signature);
    end if;
  end loop;
end
$$;
