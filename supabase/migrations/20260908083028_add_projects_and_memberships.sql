-- Migration:  20260908083028_add_projects_and_memberships
-- Purpose:    Introduce projects and role-bearing memberships, attach every
--             existing item to its creator's default project, and replace
--             owner-only item policies with project-membership policies.
--             New accounts receive a default project in the existing auth
--             mirror trigger. Deleting a project cascades to its items.
-- Reversible: no. Rolling back would lose project grouping and cannot restore
--             a deleted project's items.

create table public.projects (
  id         uuid        primary key default public.uuid_generate_v7(),
  name       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_length_chk check (char_length(name) between 1 and 255)
);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_memberships (
  project_id uuid        not null references public.projects (id) on delete cascade,
  user_id    uuid        not null references public.users (id) on delete cascade,
  role       text        not null,
  created_at timestamptz not null default now(),
  constraint project_memberships_pkey primary key (project_id, user_id),
  constraint project_memberships_role_chk check (role in ('owner', 'member'))
);

-- The primary key starts with project_id. Listing one account's projects and
-- evaluating membership policies need the inverse direction too.
create index project_memberships_user_id_project_id_idx
  on public.project_memberships (user_id, project_id);

alter table public.items add column project_id uuid;

-- One default project per existing account. The loop keeps the generated id
-- local to the account being migrated, so every old item is attached to the
-- correct project without introducing a permanent owner column on projects.
do $$
declare
  account record;
  default_project_id uuid;
begin
  for account in select id from public.users order by id loop
    default_project_id := public.uuid_generate_v7();

    insert into public.projects (id, name)
    values (default_project_id, 'My project');

    insert into public.project_memberships (project_id, user_id, role)
    values (default_project_id, account.id, 'owner');

    update public.items
    set project_id = default_project_id
    where user_id = account.id;
  end loop;
end
$$;

alter table public.items
  alter column project_id set not null,
  add constraint items_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;

-- Serves a project's keyset-paginated item list and the project delete
-- cascade. The old owner pagination index no longer matches a product query.
drop index public.items_user_id_created_at_idx;
create index items_project_id_created_at_idx
  on public.items (project_id, created_at desc, id desc)
  where deleted_at is null;

-- RLS applies to public-key access even though the API currently uses the
-- service role and repeats the same membership checks in its repositories.
alter table public.projects enable row level security;
alter table public.project_memberships enable row level security;

-- New Supabase projects no longer expose public tables automatically. Keep
-- browser access limited to the operations protected below by RLS, while the
-- backend service role retains the table access its repositories need.
do $$
begin
  if to_regrole('authenticated') is not null then
    execute 'grant select, delete on table public.projects to authenticated';
    execute 'grant select on table public.project_memberships to authenticated';
    execute 'grant select, insert, update, delete on table public.items to authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant select, insert, update, delete on table public.projects, public.project_memberships, public.items to service_role';
  end if;
end
$$;

create policy project_memberships_select_self on public.project_memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy projects_select_member on public.projects
  for select to authenticated
  using (
    exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = projects.id
        and membership.user_id = (select auth.uid())
    )
  );

create policy projects_delete_owner on public.projects
  for delete to authenticated
  using (
    exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = projects.id
        and membership.user_id = (select auth.uid())
        and membership.role = 'owner'
    )
  );

drop policy items_select_own on public.items;
drop policy items_insert_own on public.items;
drop policy items_update_own on public.items;
drop policy items_delete_own on public.items;

create policy items_select_project_member on public.items
  for select to authenticated
  using (
    exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = items.project_id
        and membership.user_id = (select auth.uid())
    )
  );

create policy items_insert_project_member on public.items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = items.project_id
        and membership.user_id = (select auth.uid())
    )
  );

create policy items_update_project_member on public.items
  for update to authenticated
  using (
    exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = items.project_id
        and membership.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = items.project_id
        and membership.user_id = (select auth.uid())
    )
  );

create policy items_delete_project_member on public.items
  for delete to authenticated
  using (
    exists (
      select 1
      from public.project_memberships membership
      where membership.project_id = items.project_id
        and membership.user_id = (select auth.uid())
    )
  );

-- The backend calls this with the service role. Keeping project creation and
-- its owner membership in one function prevents an unreachable orphan project
-- if the second insert fails.
create function public.create_project_for_owner(
  p_project_id uuid,
  p_user_id    uuid,
  p_name       text
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.projects (id, name)
  values (p_project_id, p_name);

  insert into public.project_memberships (project_id, user_id, role)
  values (p_project_id, p_user_id, 'owner');
end
$$;

revoke execute on function public.create_project_for_owner(uuid, uuid, text)
  from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.create_project_for_owner(uuid, uuid, text) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.create_project_for_owner(uuid, uuid, text) from authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.create_project_for_owner(uuid, uuid, text) to service_role';
  end if;
end
$$;

-- Extends the existing auth mirror without adding a second trigger whose
-- partial failure could leave a public user without a project. Updates still
-- mirror the email but do not create another project.
create or replace function public.mirror_auth_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  default_project_id uuid;
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  if tg_op = 'INSERT' then
    default_project_id := public.uuid_generate_v7();

    insert into public.projects (id, name)
    values (default_project_id, 'My project');

    insert into public.project_memberships (project_id, user_id, role)
    values (default_project_id, new.id, 'owner');
  end if;

  return new;
end
$$;

-- Item creation keeps the outbox guarantee from US-10 and now records the
-- project in the same transaction too.
drop function public.create_item_with_event(uuid, uuid, text, uuid, text, timestamptz, jsonb);

create function public.create_item_with_event(
  p_item_id     uuid,
  p_user_id     uuid,
  p_project_id  uuid,
  p_name        text,
  p_event_id    uuid,
  p_event_name  text,
  p_occurred_at timestamptz,
  p_payload     jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.items (id, user_id, project_id, name)
  values (p_item_id, p_user_id, p_project_id, p_name);

  insert into public.outbox (id, name, occurred_at, payload)
  values (p_event_id, p_event_name, p_occurred_at, p_payload);
end
$$;

revoke execute on function public.create_item_with_event(
  uuid, uuid, uuid, text, uuid, text, timestamptz, jsonb
) from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.create_item_with_event(uuid, uuid, uuid, text, uuid, text, timestamptz, jsonb) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.create_item_with_event(uuid, uuid, uuid, text, uuid, text, timestamptz, jsonb) from authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.create_item_with_event(uuid, uuid, uuid, text, uuid, text, timestamptz, jsonb) to service_role';
  end if;
end
$$;
