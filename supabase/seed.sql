-- Local demonstration data, replayed by `supabase db reset` (`npm run db:reset`)
-- and by the first `supabase start` of a fresh stack.
--
-- Two accounts, three projects, tasks in every column with priorities and due
-- dates relative to the day the seed runs, and one unread notification, so the
-- application opens in a realistic state instead of an empty board. The
-- credentials are listed in the README. Every address is on example.com and
-- every name is invented: nothing here belongs to a real person.
--
-- The system user that items.user_id depends on is created by the initial
-- migration, not here, because it must exist in every environment.

-- The accounts below have a published password. They must never exist on a
-- hosted database, and `supabase db reset --linked` or `supabase db push
-- --include-seed` would apply this file to one. The local stack is the only
-- database that runs on the JWT secret the Supabase CLI publishes for local
-- development; a hosted project has its own, and a plain Postgres has none.
do $$
begin
  if current_setting('app.settings.jwt_secret', true) is distinct from
     'super-secret-jwt-token-with-at-least-32-characters-long' then
    raise exception 'supabase/seed.sql only runs on the local Supabase stack';
  end if;
end
$$;

do $$
declare
  camille          constant uuid := '0000de00-0000-7000-8000-000000000001';
  hugo             constant uuid := '0000de00-0000-7000-8000-000000000002';
  mobile_launch    constant uuid := '0000de00-0000-7000-8000-000000000101';
  -- Written by the sign-up form in the real flow; PRIVACY_POLICY_VERSION in
  -- packages/contracts/src/auth.ts. The mirroring trigger records it as the
  -- account's consent.
  policy_version   constant text := '2026-09-25';
  camille_default  uuid;
  hugo_default     uuid;
  account          record;
begin
  for account in
    select * from (values
      (camille, 'camille.demo@example.com'),
      (hugo, 'hugo.demo@example.com')
    ) as demo (id, email)
  loop
    -- The empty strings are not decoration: GoTrue reads these columns into
    -- non-nullable strings and refuses the sign-in when one of them is null.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', account.id, 'authenticated',
      'authenticated', account.email,
      extensions.crypt('DemoLegacy2026', extensions.gen_salt('bf')), now(),
      '{"provider": "email", "providers": ["email"]}',
      jsonb_build_object('policy_version', policy_version), now(), now(),
      '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      account.id::text, account.id,
      jsonb_build_object('sub', account.id::text, 'email', account.email, 'email_verified', true),
      'email', now(), now(), now()
    )
    on conflict (provider_id, provider) do nothing;
  end loop;

  -- The trigger on auth.users gave each account a default project, as it does
  -- for a real sign-up. It is renamed rather than left as "My project".
  select membership.project_id into camille_default
  from public.project_memberships membership
  where membership.user_id = camille and membership.project_id <> mobile_launch
  order by membership.created_at
  limit 1;

  select membership.project_id into hugo_default
  from public.project_memberships membership
  where membership.user_id = hugo
  order by membership.created_at
  limit 1;

  update public.projects set name = 'Website redesign' where id = camille_default;
  update public.projects set name = 'Office move' where id = hugo_default;

  insert into public.projects (id, name)
  values (mobile_launch, 'Mobile app launch')
  on conflict (id) do nothing;

  insert into public.project_memberships (project_id, user_id, role)
  values (mobile_launch, camille, 'owner')
  on conflict (project_id, user_id) do nothing;

  insert into public.items (id, user_id, project_id, name, status, priority, due_date)
  values
    ('0000de00-0000-7000-8000-000000000201', camille, camille_default,
     'Fix the broken links in the footer', 'todo', 'high', current_date - 3),
    ('0000de00-0000-7000-8000-000000000202', camille, camille_default,
     'Send the new homepage mockup for review', 'todo', 'high', current_date),
    ('0000de00-0000-7000-8000-000000000203', camille, camille_default,
     'Write the accessibility statement', 'todo', 'normal', current_date + 7),
    ('0000de00-0000-7000-8000-000000000204', camille, camille_default,
     'Rework the navigation menu', 'doing', 'normal', current_date + 2),
    ('0000de00-0000-7000-8000-000000000205', camille, camille_default,
     'Choose the new colour palette', 'done', 'low', null),
    ('0000de00-0000-7000-8000-000000000206', camille, mobile_launch,
     'Prepare the store screenshots', 'todo', 'normal', current_date + 10),
    ('0000de00-0000-7000-8000-000000000207', camille, mobile_launch,
     'Test the sign-in flow on a small screen', 'doing', 'high', current_date + 1),
    ('0000de00-0000-7000-8000-000000000208', camille, mobile_launch,
     'Draft the release notes', 'todo', 'low', null),
    ('0000de00-0000-7000-8000-000000000209', hugo, hugo_default,
     'Book the moving company', 'doing', 'high', current_date + 5),
    ('0000de00-0000-7000-8000-000000000210', hugo, hugo_default,
     'Label the archive boxes', 'todo', 'low', null),
    ('0000de00-0000-7000-8000-000000000211', hugo, hugo_default,
     'Order the new desks', 'done', 'normal', current_date - 6)
  on conflict (id) do nothing;

  -- What the worker writes when it consumes item.created.v1, written here so
  -- the notification list has something to show before any event happens.
  insert into public.processed_events (event_id)
  values
    ('0000de00-0000-7000-8000-000000000301'),
    ('0000de00-0000-7000-8000-000000000302')
  on conflict (event_id) do nothing;

  insert into public.notifications (event_id, user_id, item_id, kind, read_at, created_at)
  values
    ('0000de00-0000-7000-8000-000000000301', camille,
     '0000de00-0000-7000-8000-000000000202', 'item.created', null, now()),
    ('0000de00-0000-7000-8000-000000000302', camille,
     '0000de00-0000-7000-8000-000000000205', 'item.created', now() - interval '1 day',
     now() - interval '2 days')
  on conflict (event_id) do nothing;
end
$$;
