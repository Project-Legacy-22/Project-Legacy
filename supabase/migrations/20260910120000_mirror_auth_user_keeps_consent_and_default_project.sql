-- Migration:  20260910120000_mirror_auth_user_keeps_consent_and_default_project
-- Purpose:    Restore in public.mirror_auth_user() the default project that
--             20260908083028 added and that 20260910110000 silently dropped.
--
--             Both migrations redefine the same function with `create or
--             replace`, and the later one wins whole: the consent columns
--             landed, the default project left. Registration then created an
--             account with no project, and every item route -- which addresses
--             items through a project since US-16 -- had nothing to address.
--             The integration suite caught it: "registration did not create a
--             default project".
--
--             The comment in 20260910110000 warned about exactly this, in the
--             other direction: "rewriting it here would silently revert
--             whatever landed in between". The trap is the mechanism, not the
--             author -- `create or replace` carries no record of what it
--             replaced, so two branches touching one function cannot see each
--             other.
-- Reversible: yes.
-- Rollback:   restore the definition from 20260910110000, which is this one
--             without the two project inserts.

create or replace function public.mirror_auth_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  consented_version text;
  default_project_id uuid;
begin
  -- Written by the sign-up as user metadata (20260910110000). Absent for any
  -- other path, which leaves the columns null rather than inventing a consent.
  consented_version := new.raw_user_meta_data ->> 'policy_version';

  insert into public.users (id, email, policy_version, policy_accepted_at)
  values (
    new.id,
    new.email,
    consented_version,
    case when consented_version is null then null else now() end
  )
  on conflict (id) do update set email = excluded.email;

  -- On insert only (20260908083028). An update of auth.users must not hand
  -- somebody a second project every time they change their address.
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
