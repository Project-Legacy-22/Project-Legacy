-- Migration:  20260910221142_item_priority_due_date
-- Purpose:    Add the optional planning attributes carried by US-19 and the
--             index that serves its stable priority and due-date ordering.
-- Reversible: yes. Drop the replacement function and index, remove due_date
--             and priority, then drop public.item_priority. Values entered
--             after this migration would be lost by that rollback.

create type public.item_priority as enum ('low', 'normal', 'high');

alter table public.items
  add column priority public.item_priority not null default 'normal',
  add column due_date date;

drop index public.items_project_id_created_at_idx;

-- Equality on project_id comes first. Enum order is reversed so high precedes
-- normal and low; undated tasks follow dated ones, and id is the deterministic
-- final key used by cursor pagination.
create index items_project_id_priority_due_date_id_idx
  on public.items (project_id, priority desc, due_date asc nulls last, id asc);

-- Item creation and its outbox event remain one statement and therefore one
-- transaction. Replacing the signature is necessary so the two new values are
-- present from the first response rather than filled in by a second write.
drop function public.create_item_with_event(
  uuid, uuid, uuid, text, uuid, text, timestamptz, jsonb
);

create function public.create_item_with_event(
  p_item_id     uuid,
  p_user_id     uuid,
  p_project_id  uuid,
  p_name        text,
  p_priority    public.item_priority,
  p_due_date    date,
  p_event_id    uuid,
  p_event_name  text,
  p_occurred_at timestamptz,
  p_payload     jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.items (
    id,
    user_id,
    project_id,
    name,
    priority,
    due_date
  ) values (
    p_item_id,
    p_user_id,
    p_project_id,
    p_name,
    p_priority,
    p_due_date
  );

  insert into public.outbox (id, name, occurred_at, payload)
  values (p_event_id, p_event_name, p_occurred_at, p_payload);
end
$$;

revoke execute on function public.create_item_with_event(
  uuid, uuid, uuid, text, public.item_priority, date,
  uuid, text, timestamptz, jsonb
) from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.create_item_with_event(uuid, uuid, uuid, text, public.item_priority, date, uuid, text, timestamptz, jsonb) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'grant usage on type public.item_priority to authenticated';
    execute 'revoke execute on function public.create_item_with_event(uuid, uuid, uuid, text, public.item_priority, date, uuid, text, timestamptz, jsonb) from authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant usage on type public.item_priority to service_role';
    execute 'grant execute on function public.create_item_with_event(uuid, uuid, uuid, text, public.item_priority, date, uuid, text, timestamptz, jsonb) to service_role';
  end if;
end
$$;
