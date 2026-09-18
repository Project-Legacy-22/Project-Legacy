-- Migration: 20260918074845_remove_project_member
-- Purpose: Remove a membership without deleting the account or its tasks.
-- Reversible schema: drop function public.remove_project_member(uuid, uuid, uuid).
-- Removed memberships cannot be reconstructed by rollback; re-add explicitly.

create function public.remove_project_member(
  p_project_id uuid,
  p_caller_id uuid,
  p_member_id uuid
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_role text;
  member_role text;
begin
  -- Every removal locks the same project before reading memberships. Under
  -- READ COMMITTED, the statements after this lock see a preceding removal's
  -- commit, including the caller losing their rights while waiting.
  perform 1 from public.projects where id = p_project_id for update;
  if not found then return 'project_not_found'; end if;

  select role into caller_role from public.project_memberships
  where project_id = p_project_id and user_id = p_caller_id;
  if caller_role is null then return 'project_not_found'; end if;
  if caller_role <> 'owner' then return 'owner_required'; end if;

  select role into member_role from public.project_memberships
  where project_id = p_project_id and user_id = p_member_id;
  if member_role is null then return 'member_not_found'; end if;

  if member_role = 'owner' and not exists (
    select 1 from public.project_memberships
    where project_id = p_project_id and role = 'owner' and user_id <> p_member_id
  ) then
    return 'last_owner';
  end if;

  -- US-58 (#348) must clear this project's matching assignments here, in
  -- this transaction, once that column exists. user_id identifies the creator
  -- and must never be cleared or used as an assignment substitute.
  delete from public.project_memberships
  where project_id = p_project_id and user_id = p_member_id;

  return 'removed';
end
$$;

-- The caller identifier is supplied by the authenticated backend, not by a
-- browser. No public role may invoke this function with a forged identity.
revoke execute on function public.remove_project_member(uuid, uuid, uuid) from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.remove_project_member(uuid, uuid, uuid) from anon';
  end if;
  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.remove_project_member(uuid, uuid, uuid) from authenticated';
  end if;
  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.remove_project_member(uuid, uuid, uuid) to service_role';
  end if;
end
$$;
