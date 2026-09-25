-- #401 : l invitation, sa reponse et sa notification.
--
-- Verifie ici plutot qu au niveau integration pour la meme raison que les blocs
-- d appartenance : le `rollback` garantit qu aucune ligne d outbox ne survit.
begin;

do $$
declare
  proprietaire uuid := '00000000-0000-7000-8000-0000000000a1';
  invitee      uuid := '00000000-0000-7000-8000-0000000000a2';
  intrus       uuid := '00000000-0000-7000-8000-0000000000a3';
  projet       uuid;
  invitation   uuid := '00000000-0000-7000-8000-0000000000b1';
  seconde      uuid := '00000000-0000-7000-8000-0000000000b2';
  troisieme    uuid := '00000000-0000-7000-8000-0000000000b3';
  event_un     uuid := '00000000-0000-7000-8000-0000000000c1';
  event_deux   uuid := '00000000-0000-7000-8000-0000000000c2';
  event_trois  uuid := '00000000-0000-7000-8000-0000000000c3';
  issue        text;
  applique     boolean;
begin
  insert into auth.users (id, email)
  values (proprietaire, 'invite-owner@localhost'),
         (invitee, 'invite-guest@localhost'),
         (intrus, 'invite-stranger@localhost');

  select project_id into projet
  from public.project_memberships
  where user_id = proprietaire and role = 'owner'
  limit 1;

  issue := public.invite_member_with_event(
    invitation, projet, invitee, proprietaire, event_un, 'invitation.created.v1', now(),
    jsonb_build_object('invitationId', invitation, 'projectId', projet, 'inviteeId', invitee, 'invitedBy', proprietaire)
  );
  if issue <> 'invited' then
    raise exception 'la premiere invitation aurait du repondre invited, pas %', issue;
  end if;

  if not exists (
    select 1 from public.outbox
    where id = event_un and name = 'invitation.created.v1' and published_at is null
  ) then
    raise exception 'l evenement de l invitation manque';
  end if;

  -- Deux invitations en attente pour la meme personne ne coexistent pas, et
  -- la seconde n annonce rien.
  issue := public.invite_member_with_event(
    seconde, projet, invitee, proprietaire, event_deux, 'invitation.created.v1', now(),
    jsonb_build_object('invitationId', seconde, 'projectId', projet, 'inviteeId', invitee, 'invitedBy', proprietaire)
  );
  if issue <> 'already_invited' then
    raise exception 'la seconde invitation aurait du repondre already_invited, pas %', issue;
  end if;
  if exists (select 1 from public.outbox where id = event_deux) then
    raise exception 'la seconde invitation a ecrit un evenement';
  end if;

  -- La notification, idempotente.
  applique := public.record_invitation_notification(event_un, invitee, projet, invitation);
  if not applique then
    raise exception 'la notification d invitation n a pas ete appliquee';
  end if;
  applique := public.record_invitation_notification(event_un, invitee, projet, invitation);
  if applique or (select count(*) from public.notifications where event_id = event_un) <> 1 then
    raise exception 'la redelivrance a ecrit une seconde notification';
  end if;
  if not exists (
    select 1 from public.notifications
    where event_id = event_un and kind = 'invitation.created'
      and invitation_id = invitation and project_id = projet and item_id is null
  ) then
    raise exception 'la notification d invitation ne porte pas ce qu elle doit porter';
  end if;

  -- Une autre personne ne repond pas a l invitation : elle n existe pas pour elle.
  if public.respond_to_invitation(invitation, intrus, true) <> 'not_found' then
    raise exception 'un autre compte a pu repondre a l invitation';
  end if;

  if public.respond_to_invitation(invitation, invitee, true) <> 'accepted' then
    raise exception 'accepter aurait du repondre accepted';
  end if;
  if not exists (
    select 1 from public.project_memberships
    where project_id = projet and user_id = invitee and role = 'member'
  ) then
    raise exception 'accepter n a pas ajoute la personne au projet';
  end if;
  if public.respond_to_invitation(invitation, invitee, false) <> 'already_answered' then
    raise exception 'une invitation traitee a pu etre traitee une seconde fois';
  end if;

  -- Inviter un membre ne cree rien.
  if public.invite_member_with_event(
    troisieme, projet, invitee, proprietaire, event_trois, 'invitation.created.v1', now(), '{}'::jsonb
  ) <> 'already_member' then
    raise exception 'inviter un membre aurait du repondre already_member';
  end if;

  raise notice 'invitation assertions passed';
end $$;

rollback;

-- Refuser n ajoute personne.
begin;

do $$
declare
  proprietaire uuid := '00000000-0000-7000-8000-0000000000a4';
  invitee      uuid := '00000000-0000-7000-8000-0000000000a5';
  projet       uuid;
  invitation   uuid := '00000000-0000-7000-8000-0000000000b4';
begin
  insert into auth.users (id, email)
  values (proprietaire, 'decline-owner@localhost'),
         (invitee, 'decline-guest@localhost');

  select project_id into projet
  from public.project_memberships
  where user_id = proprietaire and role = 'owner'
  limit 1;

  perform public.invite_member_with_event(
    invitation, projet, invitee, proprietaire, '00000000-0000-7000-8000-0000000000c4',
    'invitation.created.v1', now(), '{}'::jsonb
  );

  if public.respond_to_invitation(invitation, invitee, false) <> 'declined' then
    raise exception 'refuser aurait du repondre declined';
  end if;
  if exists (
    select 1 from public.project_memberships where project_id = projet and user_id = invitee
  ) then
    raise exception 'refuser a ajoute la personne au projet';
  end if;

  raise notice 'invitation decline assertions passed';
end $$;

rollback;

-- Effacer la personne qui invite ne doit emporter ni l invitation ni la
-- notification qu elle a produite pour la personne invitee (#425), tant que le
-- projet lui-meme survit -- ce que garantit ici un second membre reel, pour ne
-- pas confondre cette regle avec la suppression, deja voulue, d un projet dont
-- l auteur etait le seul membre.
begin;

do $$
declare
  proprietaire uuid := '00000000-0000-7000-8000-0000000000a6';
  reste        uuid := '00000000-0000-7000-8000-0000000000a7';
  invitee      uuid := '00000000-0000-7000-8000-0000000000a8';
  projet       uuid;
  invitation   uuid := '00000000-0000-7000-8000-0000000000b5';
  evenement    uuid := '00000000-0000-7000-8000-0000000000c5';
begin
  insert into auth.users (id, email)
  values (proprietaire, 'erase-inviter@localhost'),
         (reste, 'erase-remaining-member@localhost'),
         (invitee, 'erase-invitee@localhost');

  select project_id into projet
  from public.project_memberships
  where user_id = proprietaire and role = 'owner'
  limit 1;

  insert into public.project_memberships (project_id, user_id, role)
  values (projet, reste, 'member');

  perform public.invite_member_with_event(
    invitation, projet, invitee, proprietaire, evenement,
    'invitation.created.v1', now(),
    jsonb_build_object('invitationId', invitation, 'projectId', projet, 'inviteeId', invitee, 'invitedBy', proprietaire)
  );
  perform public.record_invitation_notification(evenement, invitee, projet, invitation);

  perform public.erase_account(proprietaire);

  if not exists (select 1 from public.projects where id = projet) then
    raise exception 'erasing the inviter deleted a project that still has a member';
  end if;
  if not exists (
    select 1 from public.project_invitations where id = invitation and invited_by is null
  ) then
    raise exception 'erasing the inviter did not clear invited_by on the invitation';
  end if;
  if not exists (select 1 from public.notifications where invitation_id = invitation) then
    raise exception 'erasing the inviter deleted the notification it had produced';
  end if;

  raise notice 'invitation erasure assertions passed';
end $$;

rollback;
