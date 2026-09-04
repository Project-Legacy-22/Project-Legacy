-- Structural assertions run in CI against a fresh database with every migration
-- in supabase/migrations applied (see .github/workflows/ci.yml). It gives teeth
-- to the EN-09 acceptance criteria that a comment in a migration cannot: every
-- table has a primary key, user data carries a mandatory, indexed, foreign-keyed
-- owner, timestamps are timezone-aware, and the name constraint the inherited
-- table never had is present.
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

  -- 2. items.user_id is mandatory: user data always carries its owner.
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

  -- 5. users.email is unique.
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

  -- 6. Timestamps are timezone-aware and stored in UTC.
  select string_agg(format('%s.%s', table_name, column_name), ', ')
    into offending
  from information_schema.columns
  where table_schema = 'public'
    and column_name in ('created_at', 'updated_at', 'deleted_at')
    and data_type <> 'timestamp with time zone';
  if offending is not null then
    raise exception 'timestamp columns not timestamptz: %', offending;
  end if;

  -- 7. items.name carries a CHECK constraint (length bound the inherited table
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

  -- 8. The single-user system account the items foreign key depends on exists
  --    in every environment (D-20), so it is seeded by the migration, not by
  --    supabase/seed.sql.
  if not exists (
    select 1 from public.users where id = '00000000-0000-7000-8000-000000000001'
  ) then
    raise exception 'the system user must be seeded by the initial migration';
  end if;

  -- 9. Row-level security is enabled on every table holding user data.
  select string_agg(rel.relname, ', ')
    into offending
  from pg_class rel
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relkind = 'r'
    and rel.relname in ('users', 'items')
    and rel.relrowsecurity = false;
  if offending is not null then
    raise exception 'row-level security disabled on: %', offending;
  end if;

  -- 10. Row-level security without a policy denies everything, which is safe
  --     and proves nothing. US-11 requires the ownership policies to exist, so
  --     their absence must fail the job rather than pass quietly.
  select string_agg(rel.relname, ', ')
    into offending
  from pg_class rel
  join pg_namespace n on n.oid = rel.relnamespace
  where n.nspname = 'public' and rel.relkind = 'r'
    and rel.relname in ('users', 'items')
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = rel.relname
    );
  if offending is not null then
    raise exception 'row-level security enabled without any policy on: %', offending;
  end if;

  -- 11. items carries a policy for each of the four commands: a table readable
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

  -- 12. Every account created by the provider gets its application row, without
  --     which items.user_id cannot reference the account a session designates.
  if not exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_changed'
  ) then
    raise exception 'auth.users must be mirrored into public.users by a trigger';
  end if;

  raise notice 'schema assertions passed';
end $$;
