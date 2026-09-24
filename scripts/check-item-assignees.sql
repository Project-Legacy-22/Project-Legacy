-- #419 : plusieurs attributaires par tache, des la creation.
--
-- Dans une transaction annulee, comme les autres blocs.
begin;

do $$
declare
  proprietaire uuid := '00000000-0000-7000-8000-0000000000f1';
  membre       uuid := '00000000-0000-7000-8000-0000000000f2';
  intrus       uuid := '00000000-0000-7000-8000-0000000000f3';
  projet       uuid;
  tache        uuid := '00000000-0000-7000-8000-0000000000f4';
  refusee      uuid := '00000000-0000-7000-8000-0000000000f5';
  nombre       integer;
begin
  insert into auth.users (id, email)
  values (proprietaire, 'assignees-owner@localhost'),
         (membre, 'assignees-member@localhost'),
         (intrus, 'assignees-stranger@localhost');

  select project_id into projet
  from public.project_memberships
  where user_id = proprietaire and role = 'owner'
  limit 1;

  insert into public.project_memberships (project_id, user_id, role)
  values (projet, membre, 'member');

  -- La creation ecrit la tache et ses attributaires ; un doublon compte une fois.
  perform public.create_item_with_event(
    tache, proprietaire, projet, 'Tache partagee', 'normal', null,
    '00000000-0000-7000-8000-0000000000f6', 'item.created.v1', now(),
    jsonb_build_object('itemId', tache, 'ownerId', proprietaire),
    array[proprietaire, membre, membre]
  );
  select count(*) into nombre from public.item_assignees where item_id = tache;
  if nombre <> 2 then
    raise exception 'creating a task must store each assignee once, got %', nombre;
  end if;

  -- Un intrus annule toute la creation : ni tache, ni evenement.
  begin
    perform public.create_item_with_event(
      refusee, proprietaire, projet, 'Refusee', 'normal', null,
      '00000000-0000-7000-8000-0000000000f7', 'item.created.v1', now(),
      jsonb_build_object('itemId', refusee, 'ownerId', proprietaire),
      array[intrus]
    );
    raise exception 'creating a task assigned to an outsider must be refused';
  exception
    when foreign_key_violation then null;
  end;
  if exists (select 1 from public.items where id = refusee)
     or exists (select 1 from public.outbox where id = '00000000-0000-7000-8000-0000000000f7') then
    raise exception 'a refused creation must leave neither task nor event';
  end if;

  -- Remplacer la liste retire ce qui n y est plus et ajoute le reste.
  perform public.set_item_assignees(tache, projet, array[membre]);
  if (select array_agg(user_id) from public.item_assignees where item_id = tache) <> array[membre] then
    raise exception 'setting the assignees must replace the list';
  end if;
  perform public.set_item_assignees(tache, projet, '{}');
  if exists (select 1 from public.item_assignees where item_id = tache) then
    raise exception 'an empty list must unassign the task';
  end if;

  begin
    perform public.set_item_assignees(tache, projet, array[intrus]);
    raise exception 'assigning an outsider must be refused';
  exception
    when foreign_key_violation then null;
  end;

  -- Retirer le membre supprime son attribution, pas la tache.
  perform public.set_item_assignees(tache, projet, array[proprietaire, membre]);
  delete from public.project_memberships where project_id = projet and user_id = membre;
  if exists (select 1 from public.item_assignees where item_id = tache and user_id = membre)
     or not exists (select 1 from public.items where id = tache) then
    raise exception 'removing a member must remove their assignment and keep the task';
  end if;

  -- Supprimer la tache supprime ses attributions.
  delete from public.items where id = tache;
  if exists (select 1 from public.item_assignees where item_id = tache) then
    raise exception 'deleting a task must delete its assignments';
  end if;

  raise notice 'item assignees assertions passed';
end
$$;

rollback;
