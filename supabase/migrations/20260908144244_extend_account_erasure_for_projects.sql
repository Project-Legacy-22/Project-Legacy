-- Migration:  20260908144244_extend_account_erasure_for_projects
-- Purpose:    Complete US-13 now that US-16 introduces projects. Account
--             erasure removes the caller's memberships and deletes projects
--             where that caller is the last member, while preserving shared
--             projects and the remaining members' data.
-- Reversible: no. The function can be replaced by an older definition, but
--             projects and items erased while this version ran cannot be
--             reconstructed.

create or replace function public.erase_account(p_user_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.processed_events
  where event_id in (
    select id from public.outbox where payload ->> 'ownerId' = p_user_id::text
  );

  delete from public.outbox
  where payload ->> 'ownerId' = p_user_id::text;

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

  -- Cascades to items created by this account, its remaining memberships and
  -- notifications. Shared projects survive because another membership still
  -- references them.
  delete from public.users where id = p_user_id;
end
$$;

-- This function accepts an account identifier and runs with the caller's
-- database privileges. It is an application-internal operation, never a
-- public RPC: only the backend service role may invoke it.
revoke execute on function public.erase_account(uuid)
  from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.erase_account(uuid) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.erase_account(uuid) from authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.erase_account(uuid) to service_role';
  end if;
end
$$;
