-- Runs inside check-schema.sql in CI, or independently with psql -f.
-- Fixtures and the fault-injection trigger are rolled back on success.
\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_removal_result(actual text, expected text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'member removal returned %, expected %', actual, expected;
  end if;
end
$$;

create function pg_temp.fail_member_removal() returns trigger
language plpgsql as $$
begin
  if current_setting('test.fail_member_removal', true) = 'on' then
    raise exception 'forced member removal failure' using errcode = 'P0354';
  end if;
  return old;
end
$$;

create trigger test_member_removal_failure after delete on public.project_memberships
for each row execute function pg_temp.fail_member_removal();

do $$
<<fixture>>
declare
  owner_id uuid := public.uuid_generate_v7();
  member_id uuid := public.uuid_generate_v7();
  outsider_id uuid := public.uuid_generate_v7();
  project_id uuid := public.uuid_generate_v7();
  missing_id uuid := public.uuid_generate_v7();
  item_id uuid := public.uuid_generate_v7();
  original_item jsonb;
begin
  insert into auth.users(id, email) values
    (owner_id, owner_id::text || '@example.com'),
    (member_id, member_id::text || '@example.com'),
    (outsider_id, outsider_id::text || '@example.com');
  perform public.create_project_for_owner(project_id, owner_id, 'Removal schema test');
  insert into public.project_memberships(project_id, user_id, role)
    values (project_id, member_id, 'member');
  insert into public.items(id, project_id, user_id, name, status, priority, due_date)
    values (item_id, project_id, member_id, 'Preserved task', 'doing', 'high', '2026-09-01');
  select to_jsonb(i) into original_item from public.items i where i.id = item_id;

  perform pg_temp.assert_removal_result(
    public.remove_project_member(missing_id, owner_id, member_id), 'project_not_found');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, outsider_id, member_id), 'project_not_found');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, member_id, owner_id), 'owner_required');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, member_id, member_id), 'owner_required');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, owner_id, missing_id), 'member_not_found');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, owner_id, owner_id), 'last_owner');

  -- Raise after the deletion, not before: the original membership must be
  -- restored when any later operation in the transaction fails.
  perform set_config('test.fail_member_removal', 'on', true);
  begin
    perform public.remove_project_member(project_id, owner_id, member_id);
    raise exception 'the injected failure was not reached';
  exception when sqlstate 'P0354' then
    null; -- Expected fault injection, not a swallowed production failure.
  end;
  perform set_config('test.fail_member_removal', 'off', true);
  if not exists (
    select 1 from public.project_memberships m
    where m.project_id = fixture.project_id and m.user_id = member_id
  ) then raise exception 'a failed transaction removed the membership'; end if;

  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, owner_id, member_id), 'removed');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, owner_id, member_id), 'member_not_found');
  if (select to_jsonb(i) from public.items i where i.id = item_id) is distinct from original_item then
    raise exception 'membership removal changed or deleted the member-created task';
  end if;
  if not exists (select 1 from public.users where id = member_id) or not exists (
    select 1 from public.project_memberships m
    where m.user_id = member_id and m.project_id <> fixture.project_id
  ) then raise exception 'membership removal changed the account or another project'; end if;

  insert into public.project_memberships(project_id, user_id, role)
    values (project_id, member_id, 'owner');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, owner_id, owner_id), 'removed');
  perform pg_temp.assert_removal_result(
    public.remove_project_member(project_id, member_id, member_id), 'last_owner');

  if has_function_privilege('anon', 'public.remove_project_member(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.remove_project_member(uuid,uuid,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.remove_project_member(uuid,uuid,uuid)', 'execute') then
    raise exception 'the removal RPC must be executable only by the backend service role';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.remove_project_member(uuid,uuid,uuid)'::regprocedure) then
    raise exception 'the removal RPC must not elevate its callers privileges';
  end if;
end
$$;

rollback;
