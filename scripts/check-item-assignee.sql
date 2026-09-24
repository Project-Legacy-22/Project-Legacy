-- #348 : l attribution d une tache a un membre du projet.
--
-- Dans une transaction annulee, comme les autres blocs : aucune ligne ne
-- survit a la verification.
begin;

do $$
declare
  proprietaire uuid := '00000000-0000-7000-8000-0000000000d1';
  membre       uuid := '00000000-0000-7000-8000-0000000000d2';
  intrus       uuid := '00000000-0000-7000-8000-0000000000d3';
  projet       uuid;
  tache        uuid := '00000000-0000-7000-8000-0000000000e1';
  attribue     uuid;
begin
  insert into auth.users (id, email)
  values (proprietaire, 'assign-owner@localhost'),
         (membre, 'assign-member@localhost'),
         (intrus, 'assign-stranger@localhost');

  select project_id into projet
  from public.project_memberships
  where user_id = proprietaire and role = 'owner'
  limit 1;

  insert into public.project_memberships (project_id, user_id, role)
  values (projet, membre, 'member');

  insert into public.items (id, user_id, project_id, name)
  values (tache, proprietaire, projet, 'Tache attribuee');

  update public.items set assignee_id = membre where id = tache;

  -- Une personne hors du projet est refusee par la base elle-meme.
  begin
    update public.items set assignee_id = intrus where id = tache;
    raise exception 'assigning a task to someone outside the project must be refused';
  exception
    when foreign_key_violation then null;
  end;

  -- Retirer le membre laisse la tache, sans attributaire, et son createur.
  delete from public.project_memberships where project_id = projet and user_id = membre;

  select assignee_id into attribue from public.items where id = tache;
  if attribue is not null then
    raise exception 'removing a member must leave their tasks unassigned';
  end if;
  if not exists (select 1 from public.items where id = tache and user_id = proprietaire) then
    raise exception 'removing the assignee must keep the task and its creator';
  end if;

  -- Supprimer le projet emporte ses taches, attribuees ou non, sans que les
  -- deux cascades se contrarient.
  insert into public.project_memberships (project_id, user_id, role)
  values (projet, membre, 'member');
  update public.items set assignee_id = membre where id = tache;
  delete from public.projects where id = projet;

  if exists (select 1 from public.items where id = tache) then
    raise exception 'deleting a project must delete its assigned tasks';
  end if;

  raise notice 'item assignee assertions passed';
end
$$;

rollback;
