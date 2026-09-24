-- Migration: 20260924100000_project_invitations
-- Purpose: Invite a person into a project, and let that person accept or decline
--          from the notification the invitation produces (#401).
-- Reversible: yes. Drop the three functions, the notifications column and its
--             check (restoring the two-kind check of 20260915140000), then the
--             table. Answered invitations are lost with it.
--
-- Ajouter quelqu un a un projet sans son accord (add_member_with_event) reste en
-- place pour ce qu il sert deja, mais l interface passe desormais par une
-- invitation : la personne choisit d entrer.

create table public.project_invitations (
  id          uuid        primary key,
  project_id  uuid        not null references public.projects (id) on delete cascade,
  invitee_id  uuid        not null references public.users (id)    on delete cascade,
  invited_by  uuid        not null references public.users (id)    on delete cascade,
  -- Sans defaut : la fonction qui invite ecrit `pending` elle-meme, et le
  -- modele de l outil de migration, que MySQL contraint, n en porte pas.
  status      text        not null,
  created_at  timestamptz not null default now(),
  answered_at timestamptz,
  constraint project_invitations_status_chk check (status in ('pending', 'accepted', 'declined')),
  -- Une invitation en attente n a pas de date de reponse, une invitation
  -- traitee en a une : les deux champs ne peuvent pas se contredire.
  constraint project_invitations_answered_chk check ((status = 'pending') = (answered_at is null))
);

-- Une seule invitation en attente par personne et par projet. Les invitations
-- traitees restent, pour que l historique dise qui a refuse quoi, et une
-- nouvelle invitation reste possible apres un refus.
create unique index project_invitations_one_pending_idx
  on public.project_invitations (project_id, invitee_id)
  where status = 'pending';

create index project_invitations_invitee_pending_idx
  on public.project_invitations (invitee_id)
  where status = 'pending';

-- Meme posture que project_memberships : une session ne lit que ce qui la
-- concerne. L API passe par la cle service-role et decide l autorisation dans
-- ses cas d usage ; la politique est le filet si une session interrogeait la
-- table directement.
alter table public.project_invitations enable row level security;

create policy project_invitations_select_invitee on public.project_invitations
  for select to authenticated
  using (invitee_id = (select auth.uid()));

-- Une notification peut maintenant designer une invitation. Le genre dit ce que
-- la ligne porte, et la contrainte le verifie pour les trois genres.
alter table public.notifications
  add column invitation_id uuid references public.project_invitations (id) on delete cascade;

alter table public.notifications drop constraint notifications_kind_chk;

alter table public.notifications
  add constraint notifications_kind_chk check (
    (kind = 'item.created'
      and item_id is not null and project_id is null and invitation_id is null)
    or
    (kind = 'membership.created'
      and project_id is not null and item_id is null and invitation_id is null)
    or
    (kind = 'invitation.created'
      and project_id is not null and invitation_id is not null and item_id is null)
  );

-- L invitation et son evenement, dans une seule transaction, comme
-- add_member_with_event et pour la meme raison : deux requetes seraient deux
-- transactions, et un echec entre les deux laisserait une invitation que
-- personne n apprend, ou une annonce sans invitation.
--
-- Rend ce qui s est passe plutot qu un booleen, parce que la personne qui
-- invite doit le lire : invitee, deja membre, ou deja invitee.
create function public.invite_member_with_event(
  p_invitation_id uuid,
  p_project_id    uuid,
  p_invitee_id    uuid,
  p_invited_by    uuid,
  p_event_id      uuid,
  p_event_name    text,
  p_occurred_at   timestamptz,
  p_payload       jsonb
) returns text
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.project_memberships
    where project_id = p_project_id and user_id = p_invitee_id
  ) then
    return 'already_member';
  end if;

  -- `do nothing` sur l index partiel plutot qu une lecture prealable : deux
  -- invitations envoyees en meme temps ne passent pas toutes les deux.
  insert into public.project_invitations (id, project_id, invitee_id, invited_by, status)
  values (p_invitation_id, p_project_id, p_invitee_id, p_invited_by, 'pending')
  on conflict (project_id, invitee_id) where status = 'pending' do nothing;

  if not found then
    return 'already_invited';
  end if;

  insert into public.outbox (id, name, occurred_at, payload)
  values (p_event_id, p_event_name, p_occurred_at, p_payload);

  return 'invited';
end
$$;

-- La reponse de la personne invitee, et elle seule : une invitation qui ne lui
-- est pas adressee n existe pas pour elle. Accepter ecrit l appartenance dans la
-- meme transaction que la reponse ; une invitation deja traitee ne se retraite
-- pas.
create function public.respond_to_invitation(
  p_invitation_id uuid,
  p_invitee_id    uuid,
  p_accept        boolean
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_status     text;
  v_project_id uuid;
begin
  -- Verrou de la ligne : deux reponses concurrentes, accepter puis refuser,
  -- ne peuvent pas passer toutes les deux.
  select status, project_id into v_status, v_project_id
  from public.project_invitations
  where id = p_invitation_id and invitee_id = p_invitee_id
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_status <> 'pending' then
    return 'already_answered';
  end if;

  update public.project_invitations
  set status = case when p_accept then 'accepted' else 'declined' end,
      answered_at = now()
  where id = p_invitation_id;

  if p_accept then
    insert into public.project_memberships (project_id, user_id, role)
    values (v_project_id, p_invitee_id, 'member')
    on conflict (project_id, user_id) do nothing;
    return 'accepted';
  end if;

  return 'declined';
end
$$;

-- La notification de la personne invitee. Meme forme que
-- record_member_added_notification : revendiquer l evenement et ecrire son
-- effet ensemble, et une cle etrangere manquante laisse la revendication en
-- place, l effet etant devenu impossible.
create function public.record_invitation_notification(
  p_event_id      uuid,
  p_user_id       uuid,
  p_project_id    uuid,
  p_invitation_id uuid
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  begin
    insert into public.processed_events (event_id)
    values (p_event_id);
  exception
    when unique_violation then
      return false;
  end;

  begin
    insert into public.notifications (event_id, user_id, project_id, invitation_id, kind)
    values (p_event_id, p_user_id, p_project_id, p_invitation_id, 'invitation.created');
  exception
    when foreign_key_violation then
      -- Le projet, le compte ou l invitation a disparu entre l ecriture de
      -- l evenement et sa consommation : rien a notifier.
      return true;
  end;

  return true;
end
$$;

revoke execute on function public.invite_member_with_event(uuid, uuid, uuid, uuid, uuid, text, timestamptz, jsonb) from public;
revoke execute on function public.respond_to_invitation(uuid, uuid, boolean) from public;
revoke execute on function public.record_invitation_notification(uuid, uuid, uuid, uuid) from public;

-- Seul le service-role execute ces fonctions. L autorisation -- etre
-- proprietaire pour inviter, etre la personne invitee pour repondre -- est
-- verifiee dans les cas d usage et, pour la reponse, par la fonction elle-meme.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.invite_member_with_event(uuid, uuid, uuid, uuid, uuid, text, timestamptz, jsonb)',
    'public.respond_to_invitation(uuid, uuid, boolean)',
    'public.record_invitation_notification(uuid, uuid, uuid, uuid)'
  ] loop
    if to_regrole('anon') is not null then
      execute format('revoke execute on function %s from anon', signature);
    end if;
    if to_regrole('authenticated') is not null then
      execute format('revoke execute on function %s from authenticated', signature);
    end if;
    if to_regrole('service_role') is not null then
      execute format('grant execute on function %s to service_role', signature);
    end if;
  end loop;
end
$$;
