-- La notification de la personne ajoutee a un projet.
--
-- Meme forme que record_item_created_notification, et pour les memes raisons :
-- revendiquer l evenement et ecrire son effet sont deux ecritures qui ne
-- doivent pas pouvoir arriver separement. Separees en deux requetes, une
-- revendication qui survivrait a une insertion echouee transformerait chaque
-- redelivrance suivante en non-operation pour un effet jamais applique.
--
-- Deux blocs distincts, comme la version du 11 septembre l a appris : une
-- violation de cle etrangere laisse la revendication en place, sinon
-- l evenement reviendrait indefiniment pour un effet impossible.

create function public.record_member_added_notification(
  p_event_id   uuid,
  p_user_id    uuid,
  p_project_id uuid
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
      -- Deja traite : c est l issue attendue d une redelivrance.
      return false;
  end;

  begin
    insert into public.notifications (event_id, user_id, project_id, kind)
    values (p_event_id, p_user_id, p_project_id, 'membership.created');
  exception
    when foreign_key_violation then
      -- Le projet a ete supprime, ou le compte efface, entre l ecriture de
      -- l evenement et sa consommation. Rien a notifier, et l evenement reste
      -- marque : le rejouer ne produirait pas davantage.
      return true;
  end;

  return true;
end
$$;

revoke execute on function public.record_member_added_notification(
  uuid, uuid, uuid
) from public;

do $$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function public.record_member_added_notification(uuid, uuid, uuid) from anon';
  end if;

  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function public.record_member_added_notification(uuid, uuid, uuid) from authenticated';
  end if;

  if to_regrole('service_role') is not null then
    execute 'grant execute on function public.record_member_added_notification(uuid, uuid, uuid) to service_role';
  end if;
end
$$;
