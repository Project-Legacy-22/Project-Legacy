-- L appartenance et son evenement, dans une seule transaction.
--
-- « L invitation passe par les notifications » : la personne ajoutee a un
-- projet doit l apprendre, et c est le flux evenementiel qui le lui dira. Ecrire
-- l appartenance puis l evenement en deux requetes serait deux transactions --
-- PostgREST en ouvre une par requete -- et un echec entre les deux laisserait
-- soit un membre que personne n a annonce, soit une annonce sans appartenance.
--
-- Meme forme que create_item_with_event, pour la meme raison, a une difference
-- pres : celle-ci doit etre rejouable. Ajouter deux fois la meme personne est
-- une action qu un proprietaire fera, par hesitation ou par double clic, et
-- elle ne doit ni echouer ni notifier deux fois.

create function public.add_member_with_event(
  p_project_id  uuid,
  p_user_id     uuid,
  p_event_id    uuid,
  p_event_name  text,
  p_occurred_at timestamptz,
  p_payload     jsonb
) returns boolean
language plpgsql
set search_path = ''
as $$
begin
  -- `do nothing` plutot qu une lecture prealable : une lecture puis une
  -- ecriture laisserait une fenetre ou deux appels concurrents passeraient
  -- tous les deux le test et n en verraient qu un echouer.
  insert into public.project_memberships (project_id, user_id, role)
  values (p_project_id, p_user_id, 'member')
  on conflict (project_id, user_id) do nothing;

  -- FOUND est faux quand le conflit a absorbe l insertion : aucune
  -- appartenance creee, donc rien a annoncer.
  if not found then
    return false;
  end if;

  insert into public.outbox (id, name, occurred_at, payload)
  values (p_event_id, p_event_name, p_occurred_at, p_payload);

  return true;
end
$$;

-- Le nom de l evenement est un parametre, comme pour create_item_with_event :
-- le catalogue vit dans l application, et la base n a pas a le connaitre.

revoke execute on function public.add_member_with_event(
  uuid, uuid, uuid, text, timestamptz, jsonb
) from public;

-- Seul le service-role execute cette fonction. L autorisation -- etre
-- proprietaire du projet -- est decidee dans le cas d usage, et RLS ne
-- contraint pas ce role : le controle applicatif ne doit donc pas etre retire.
do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.add_member_with_event(uuid, uuid, uuid, text, timestamptz, jsonb) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.add_member_with_event(uuid, uuid, uuid, text, timestamptz, jsonb) from authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.add_member_with_event(uuid, uuid, uuid, text, timestamptz, jsonb) to service_role';
  end if;
end
$$;
