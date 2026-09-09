-- Structural assertions run in CI against a fresh database with every migration
-- in supabase/migrations applied (see .github/workflows/ci.yml). It gives teeth
-- to the data-model acceptance criteria that a comment in a migration cannot.
--
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check-schema.sql
-- Any failed assertion raises and, with ON_ERROR_STOP, fails the job.

\set ON_ERROR_STOP on

do $$
declare
  offending text;
begin
  -- 1. Every base table in public has a primary key. The inherited todo_items
  --    had none, which let two rows share an id (DET-27).
  select string_agg(t.tablename, ', ')
    into offending
  from pg_tables t
  where t.schemaname = 'public'
    and not exists (
      select 1
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where c.contype = 'p' and n.nspname = 'public' and rel.relname = t.tablename
    );
  if offending is not null then
    raise exception 'tables without a primary key: %', offending;
  end if;

  -- 2. items.user_id remains mandatory as the creator recorded by the event
  --    flow. Access control is no longer based on it: project_id is the tenant.
  if (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'user_id'
  ) <> 'NO' then
    raise exception 'items.user_id must be NOT NULL';
  end if;

  -- 3. items.user_id references users(id).
  if not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public' and tc.table_name = 'items'
      and kcu.column_name = 'user_id'
      and ccu.table_name = 'users' and ccu.column_name = 'id'
  ) then
    raise exception 'items.user_id must reference users(id)';
  end if;

  -- 4. items.user_id is covered by an index (US-11 -> RGPD: owner lookups and
  --    cascading deletes must not scan the table).
  if not exists (
    select 1
    from pg_index i
    join pg_class rel on rel.oid = i.indrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = rel.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public' and rel.relname = 'items' and a.attname = 'user_id'
  ) then
    raise exception 'items.user_id must be the leading column of an index';
  end if;

  -- 5. Every item belongs to a project, and deleting that project deletes its
  --    items. The project foreign key is indexed for listing and cascades.
  if (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'items' and column_name = 'project_id'
  ) <> 'NO' then
    raise exception 'items.project_id must be NOT NULL';
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public' and tc.table_name = 'items'
      and kcu.column_name = 'project_id'
      and ccu.table_name = 'projects' and ccu.column_name = 'id'
      and rc.delete_rule = 'CASCADE'
  ) then
    raise exception 'items.project_id must reference projects(id) on delete cascade';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class rel on rel.oid = i.indrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = rel.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public' and rel.relname = 'items' and a.attname = 'project_id'
  ) then
    raise exception 'items.project_id must be the leading column of an index';
  end if;

  -- 6. users.email is unique.
  if not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'UNIQUE'
      and tc.table_schema = 'public' and tc.table_name = 'users'
      and ccu.column_name = 'email'
  ) then
    raise exception 'users.email must have a UNIQUE constraint';
  end if;

  -- 7. Timestamps are timezone-aware and stored in UTC.
  select string_agg(format('%s.%s', table_name, column_name), ', ')
    into offending
  from information_schema.columns
  where table_schema = 'public'
    and column_name in ('created_at', 'updated_at', 'deleted_at')
    and data_type <> 'timestamp with time zone';
  if offending is not null then
    raise exception 'timestamp columns not timestamptz: %', offending;
  end if;

  -- 8. Item and project names carry database length constraints.
  --    left to the application).
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where c.contype = 'c' and n.nspname = 'public' and rel.relname = 'items'
      and pg_get_constraintdef(c.oid) ilike '%char_length(name)%'
  ) then
    raise exception 'items.name must have a CHECK constraint on its length';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where c.contype = 'c' and n.nspname = 'public' and rel.relname = 'projects'
      and pg_get_constraintdef(c.oid) ilike '%char_length(name)%'
  ) then
    raise exception 'projects.name must have a CHECK constraint on its length';
  end if;

  -- 9. The system account remains a functional fixture for old event data.
  --    in every environment (D-20), so it is seeded by the migration, not by
  --    supabase/seed.sql.
  if not exists (
    select 1 from public.users where id = '00000000-0000-7000-8000-000000000001'
  ) then
    raise exception 'the system user must be seeded by the initial migration';
  end if;

  -- 10. Every account present during the migration owns a default project,
  --     and the backfill leaves no item outside its creator's membership.
  if exists (
    select 1
    from public.users account
    where not exists (
      select 1 from public.project_memberships membership
      where membership.user_id = account.id and membership.role = 'owner'
    )
  ) then
    raise exception 'every existing account must own a default project';
  end if;

  if exists (
    select 1
    from public.items item
    where not exists (
      select 1 from public.project_memberships membership
      where membership.project_id = item.project_id and membership.user_id = item.user_id
    )
  ) then
    raise exception 'every migrated item creator must belong to its project';
  end if;

  -- 11. Membership roles are constrained to the vocabulary accepted by the
  --     contracts, and account lookups have an index in the useful direction.
  if not exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where c.contype = 'c' and n.nspname = 'public'
      and rel.relname = 'project_memberships'
      and pg_get_constraintdef(c.oid) ilike '%owner%member%'
  ) then
    raise exception 'project membership roles must be constrained';
  end if;

  if not exists (
    select 1
    from pg_index i
    join pg_class rel on rel.oid = i.indrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_attribute a on a.attrelid = rel.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public' and rel.relname = 'project_memberships'
      and a.attname = 'user_id'
  ) then
    raise exception 'project_memberships.user_id must lead an index';
  end if;

  -- 12. Row-level security is enabled on every table holding user data.
  select string_agg(rel.relname, ', ')
    into offending
  from pg_class rel
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relkind = 'r'
    and rel.relname in ('users', 'items', 'projects', 'project_memberships')
    and rel.relrowsecurity = false;
  if offending is not null then
    raise exception 'row-level security disabled on: %', offending;
  end if;

  -- 13. Row-level security without a policy denies everything, which is safe
  --     and proves nothing. US-11 requires the ownership policies to exist, so
  --     their absence must fail the job rather than pass quietly.
  select string_agg(rel.relname, ', ')
    into offending
  from pg_class rel
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relkind = 'r'
    and rel.relname in ('users', 'items', 'projects', 'project_memberships')
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = rel.relname
    );
  if offending is not null then
    raise exception 'row-level security enabled without any policy on: %', offending;
  end if;

  -- 14. Items carry one policy per command and every policy delegates access
  --     to project membership rather than creator ownership.
  --     but not writable by its owner would look protected and be unusable.
  select string_agg(c.cmd, ', ')
    into offending
  from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as c(cmd)
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'items' and p.cmd = c.cmd
  );
  if offending is not null then
    raise exception 'items has no policy for: %', offending;
  end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'items'
      and concat(coalesce(p.qual, ''), ' ', coalesce(p.with_check, ''))
        not ilike '%project_memberships%'
  ) then
    raise exception 'every items policy must check project membership';
  end if;

  -- 15. Every account created by the provider gets its application row and
  --     default project through the same trigger.
  --     which items.user_id cannot reference the account a session designates.
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_changed'
  ) then
    raise exception 'auth.users must be mirrored into public.users by a trigger';
  end if;

  -- 16. Account erasure takes an arbitrary account id and therefore stays an
  --     internal backend operation. Exposing it as a public RPC would let the
  --     caller aim it at somebody else.
  if (to_regrole('anon') is not null
      and has_function_privilege('anon', 'public.erase_account(uuid)', 'EXECUTE'))
    or (to_regrole('authenticated') is not null
        and has_function_privilege('authenticated', 'public.erase_account(uuid)', 'EXECUTE'))
    or (to_regrole('service_role') is not null
        and not has_function_privilege('service_role', 'public.erase_account(uuid)', 'EXECUTE'))
  then
    raise exception 'erase_account must only be executable by service_role';
  end if;

  raise notice 'schema assertions passed';
end $$;

-- Erasure now spans US-13 and US-16. The fixture proves that a last-member
-- project disappears with its items, while a shared project and another
-- member's data survive. The transaction is rolled back so the script remains
-- repeatable.
begin;

do $$
declare
  cible uuid := '00000000-0000-7000-8000-0000000000e1';
  temoin uuid := '00000000-0000-7000-8000-0000000000e2';
  projet_partage uuid := '00000000-0000-7000-8000-0000000000e3';
  projet_cible uuid;
  projet_temoin uuid;
  item_cible uuid := '00000000-0000-7000-8000-0000000000a1';
  item_temoin uuid := '00000000-0000-7000-8000-0000000000a2';
  item_partage uuid := '00000000-0000-7000-8000-0000000000a3';
  event_cible uuid := '00000000-0000-7000-8000-0000000000c1';
  event_temoin uuid := '00000000-0000-7000-8000-0000000000c2';
  restant integer;
begin
  insert into auth.users (id, email)
  values
    (cible, 'erasure-target@localhost'),
    (temoin, 'erasure-bystander@localhost');

  select project_id into projet_cible
  from public.project_memberships
  where user_id = cible and role = 'owner'
  limit 1;

  select project_id into projet_temoin
  from public.project_memberships
  where user_id = temoin and role = 'owner'
  limit 1;

  insert into public.projects (id, name)
  values (projet_partage, 'shared erasure fixture');

  insert into public.project_memberships (project_id, user_id, role)
  values
    (projet_partage, cible, 'member'),
    (projet_partage, temoin, 'owner');

  insert into public.items (id, user_id, project_id, name)
  values
    (item_cible, cible, projet_cible, 'target item'),
    (item_temoin, temoin, projet_temoin, 'bystander item'),
    (item_partage, temoin, projet_partage, 'shared project item');

  insert into public.outbox (id, name, occurred_at, payload)
  values
    (event_cible, 'item.created.v1', now(),
     jsonb_build_object('itemId', item_cible, 'ownerId', cible)),
    (event_temoin, 'item.created.v1', now(),
     jsonb_build_object('itemId', item_temoin, 'ownerId', temoin));

  insert into public.processed_events (event_id) values (event_cible), (event_temoin);

  insert into public.notifications (user_id, item_id, event_id)
  values (cible, item_cible, event_cible), (temoin, item_temoin, event_temoin);

  perform public.erase_account(cible);

  select count(*) into restant from (
    select 1 from public.users where id = cible
    union all select 1 from public.items where user_id = cible
    union all select 1 from public.notifications where user_id = cible
    union all select 1 from public.outbox where payload ->> 'ownerId' = cible::text
    union all select 1 from public.processed_events where event_id = event_cible
    union all select 1 from public.project_memberships where user_id = cible
  ) reste;
  if restant <> 0 then
    raise exception 'erase_account left % row(s) carrying the erased account', restant;
  end if;

  if exists (select 1 from public.projects where id = projet_cible) then
    raise exception 'erase_account kept a project whose last member was erased';
  end if;

  select count(*) into restant from (
    select 1 from public.users where id = temoin
    union all select 1 from public.items where id in (item_temoin, item_partage)
    union all select 1 from public.notifications where user_id = temoin
    union all select 1 from public.outbox where payload ->> 'ownerId' = temoin::text
    union all select 1 from public.processed_events where event_id = event_temoin
    union all select 1 from public.projects where id in (projet_temoin, projet_partage)
    union all select 1 from public.project_memberships
      where user_id = temoin and project_id in (projet_temoin, projet_partage)
  ) reste;
  if restant <> 10 then
    raise exception 'erase_account removed % row(s) belonging to another account', 10 - restant;
  end if;

  -- A caller whose erasure failed after the rows were removed has to be able to
  -- ask again, so a second call must find nothing and raise nothing.
  perform public.erase_account(cible);

  raise notice 'erasure assertions passed';
end $$;

rollback;

-- Behavioural checks for the two authorization cases ADR-0001 requires. All
-- fixtures live in a rolled-back transaction, so the script is repeatable.
begin;

insert into auth.users (id, email)
values
  ('00000000-0000-7000-8000-000000000101', 'rls-alice@example.test'),
  ('00000000-0000-7000-8000-000000000102', 'rls-bob@example.test');

do $$
begin
  if exists (
    select 1
    from (values
      ('00000000-0000-7000-8000-000000000101'::uuid),
      ('00000000-0000-7000-8000-000000000102'::uuid)
    ) as account(id)
    where not exists (
      select 1
      from public.project_memberships membership
      where membership.user_id = account.id and membership.role = 'owner'
    )
  ) then
    raise exception 'an auth signup must create an owned default project';
  end if;
end
$$;

insert into public.projects (id, name)
values
  ('00000000-0000-7000-8000-000000000201', 'Shared fixture'),
  ('00000000-0000-7000-8000-000000000202', 'Foreign fixture');

insert into public.project_memberships (project_id, user_id, role)
values
  ('00000000-0000-7000-8000-000000000201', '00000000-0000-7000-8000-000000000101', 'member'),
  ('00000000-0000-7000-8000-000000000202', '00000000-0000-7000-8000-000000000102', 'owner');

insert into public.items (id, user_id, project_id, name)
values
  (
    '00000000-0000-7000-8000-000000000301',
    '00000000-0000-7000-8000-000000000102',
    '00000000-0000-7000-8000-000000000201',
    'Visible to a member'
  ),
  (
    '00000000-0000-7000-8000-000000000302',
    '00000000-0000-7000-8000-000000000102',
    '00000000-0000-7000-8000-000000000202',
    'Hidden from a non-member'
  );

select set_config('request.jwt.claim.sub', '00000000-0000-7000-8000-000000000101', true);
set local role authenticated;

do $$
declare
  affected integer;
begin
  if not exists (
    select 1 from public.projects where id = '00000000-0000-7000-8000-000000000201'
  ) or exists (
    select 1 from public.projects where id = '00000000-0000-7000-8000-000000000202'
  ) then
    raise exception 'project RLS must expose members and hide non-members';
  end if;

  if not exists (
    select 1 from public.items where id = '00000000-0000-7000-8000-000000000301'
  ) or exists (
    select 1 from public.items where id = '00000000-0000-7000-8000-000000000302'
  ) then
    raise exception 'item RLS must expose members and hide non-members';
  end if;

  update public.items
  set completed = true
  where id = '00000000-0000-7000-8000-000000000301';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'a project member must be able to update an item';
  end if;

  update public.items
  set completed = true
  where id = '00000000-0000-7000-8000-000000000302';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'a non-member must not update a foreign item';
  end if;

  delete from public.projects
  where id in (
    '00000000-0000-7000-8000-000000000201',
    '00000000-0000-7000-8000-000000000202'
  );
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'a member or non-member must not delete a project they do not own';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-7000-8000-000000000102', true);
set local role authenticated;

delete from public.projects
where id = '00000000-0000-7000-8000-000000000202';

reset role;

do $$
begin
  if exists (
    select 1 from public.items where id = '00000000-0000-7000-8000-000000000302'
  ) then
    raise exception 'deleting a project must cascade to its items';
  end if;
end
$$;

rollback;
