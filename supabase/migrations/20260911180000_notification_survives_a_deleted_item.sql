-- Un evenement qui porte sur une tache supprimee depuis n a rien a notifier.
--
-- La version precedente n absorbait que le doublon. Une tache supprimee entre
-- l ecriture de l evenement et sa consommation faisait echouer l insertion sur
-- notifications_item_id_fkey, et cette erreur remontait jusqu au consommateur :
-- mesure sur le deploiement, un seul evenement de ce genre bloquait dix
-- evenements valides derriere lui.
--
-- La revendication de l evenement et la notification deviennent deux blocs :
-- une violation de cle etrangere laisse la revendication en place, sinon
-- l evenement reviendrait indefiniment pour un effet impossible.

create or replace function public.record_item_created_notification(
  p_event_id uuid,
  p_user_id  uuid,
  p_item_id  uuid
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
    insert into public.notifications (event_id, user_id, item_id)
    values (p_event_id, p_user_id, p_item_id);
  exception
    when foreign_key_violation then
      -- La tache n existe plus. Rien a notifier, et l evenement reste marque.
      return true;
  end;

  return true;
end
$$;
