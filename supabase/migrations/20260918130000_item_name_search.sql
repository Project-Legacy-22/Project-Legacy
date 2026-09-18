-- Migration:  20260918130000_item_name_search
-- Purpose:    Add a case- and accent-insensitive search column for US-32, so a
--             task named "Café" is found by "cafe" or "CAFE".
-- Reversible: yes. Drop the generated column, the wrapper function, then the
--             extension if nothing else in the database depends on it.

create extension if not exists unaccent;

-- unaccent(text) is STABLE, not IMMUTABLE, because it reads the active text
-- search configuration. A generated column requires an IMMUTABLE expression,
-- so this wrapper pins the dictionary explicitly instead of relying on the
-- session's configuration.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.unaccent('public.unaccent', $1)
$$;

-- Generated rather than maintained by the application: it can never drift
-- from the name it is derived from, and a write that forgets to set it is not
-- a state that can exist.
alter table public.items
  add column name_search text
  generated always as (public.immutable_unaccent(lower(coalesce(name, '')))) stored;

do $$
begin
  if to_regrole('authenticated') is not null then
    execute 'grant execute on function public.immutable_unaccent(text) to authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.immutable_unaccent(text) to service_role';
  end if;
end
$$;
