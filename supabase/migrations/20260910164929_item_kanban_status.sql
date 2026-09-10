-- Migration:  20260910164929_item_kanban_status
-- Purpose:    Replace the inherited completed flag with the three fixed Kanban
--             statuses and add a version used to reject stale moves.
-- IRREVERSIBLE: The doing status has no equivalent in the former boolean model.

create type public.item_status as enum ('todo', 'doing', 'done');

alter table public.items
  add column status public.item_status not null default 'todo',
  add column version integer not null default 1,
  add constraint items_version_positive_chk check (version > 0);

-- Preserve the meaning of every inherited row without rewriting its business
-- update timestamp as a side effect of the migration.
alter table public.items disable trigger items_set_updated_at;

update public.items
set status = 'done'
where completed;

alter table public.items enable trigger items_set_updated_at;
alter table public.items drop column completed;

do $$
begin
  if to_regrole('authenticated') is not null then
    execute 'grant usage on type public.item_status to authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant usage on type public.item_status to service_role';
  end if;
end
$$;
