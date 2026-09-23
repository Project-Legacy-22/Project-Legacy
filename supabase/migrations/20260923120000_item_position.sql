-- Migration: 20260923120000_item_position
-- Purpose: Keep a persisted position within each status, priority and due-date
--          group. A position is an opaque UUID key: swapping two adjacent keys
--          changes their order without renumbering the rest of the project.
-- Reversible: yes. Drop swap_item_position, the unique constraint and position.
--             Reverting loses user-defined ordering.

alter table public.items add column position uuid;

-- The old final sort key was id. Preserve the exact order of existing rows.
update public.items set position = id;

alter table public.items
  alter column position set not null,
  alter column position set default public.uuid_generate_v7(),
  add constraint items_position_unique unique (position) deferrable initially deferred;

drop index public.items_project_id_priority_due_date_id_idx;
create index items_project_id_priority_due_date_position_id_idx
  on public.items (project_id, priority desc, due_date asc nulls last, position asc, id asc);

-- The item and its event remain one transaction. The position of a new item
-- starts at its id, so the value returned by POST matches the persisted row.
create or replace function public.create_item_with_event(
  p_item_id uuid, p_user_id uuid, p_project_id uuid, p_name text,
  p_priority public.item_priority, p_due_date date, p_event_id uuid,
  p_event_name text, p_occurred_at timestamptz, p_payload jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.items (id, user_id, project_id, name, priority, due_date, position)
  values (p_item_id, p_user_id, p_project_id, p_name, p_priority, p_due_date, p_item_id);

  insert into public.outbox (id, name, occurred_at, payload)
  values (p_event_id, p_event_name, p_occurred_at, p_payload);
end
$$;

-- The API checks project membership before calling this service-role-only
-- function. Locking the project serializes reorders within it; the version
-- check rejects a second move of the same task rather than losing it.
create function public.swap_item_position(
  p_item_id uuid, p_project_id uuid, p_position uuid, p_expected_version integer
) returns public.items
language plpgsql
set search_path = ''
as $$
declare
  source_item public.items;
  target_item public.items;
  old_position uuid;
begin
  perform 1 from public.projects where id = p_project_id for update;
  select * into source_item from public.items
  where id = p_item_id and project_id = p_project_id for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P5003';
  end if;
  if source_item.version <> p_expected_version then
    raise exception 'item_position_conflict' using errcode = 'P5002';
  end if;

  select * into target_item from public.items
  where project_id = p_project_id and position = p_position
    and id <> p_item_id and status = source_item.status
    and priority = source_item.priority
    and due_date is not distinct from source_item.due_date
  for update;
  if not found then
    raise exception 'invalid_item_position' using errcode = 'P5001';
  end if;
  if exists (
    select 1 from public.items between_item
    where between_item.project_id = p_project_id
      and between_item.status = source_item.status
      and between_item.priority = source_item.priority
      and between_item.due_date is not distinct from source_item.due_date
      and between_item.position > least(source_item.position, target_item.position)
      and between_item.position < greatest(source_item.position, target_item.position)
  ) then
    raise exception 'invalid_item_position' using errcode = 'P5001';
  end if;

  old_position := source_item.position;
  update public.items set position = target_item.position, version = version + 1
  where id = source_item.id returning * into source_item;
  update public.items set position = old_position, version = version + 1
  where id = target_item.id;
  return source_item;
end
$$;

revoke execute on function public.swap_item_position(uuid, uuid, uuid, integer) from public;
do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.swap_item_position(uuid, uuid, uuid, integer) from anon';
  end if;
  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.swap_item_position(uuid, uuid, uuid, integer) from authenticated';
  end if;
  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.swap_item_position(uuid, uuid, uuid, integer) to service_role';
  end if;
end
$$;
