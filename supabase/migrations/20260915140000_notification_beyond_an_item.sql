-- Une notification ne parle plus forcement d une tache.
--
-- US-33 fait entrer l invitation dans le flux evenementiel : la personne
-- ajoutee a un projet doit l apprendre, et cette notification n a aucune tache
-- a nommer. `item_id` etait `not null`, donc la ligne etait impossible a
-- ecrire -- pas difficile, impossible.
--
-- Ce que la nullabilite perdue emporterait sans la contrainte ci-dessous : une
-- ligne qui ne nomme ni tache ni projet, que l interface n aurait aucun moyen
-- de rendre. Le genre et la contrainte arrivent donc ensemble.

alter table public.notifications
  add column kind       text not null default 'item.created',
  add column project_id uuid references public.projects (id) on delete cascade;

-- Le defaut n a servi qu a remplir les lignes deja ecrites, qui parlent toutes
-- d une tache. Retire aussitot : une insertion qui oublie son genre doit
-- echouer en le disant, pas devenir une creation de tache par defaut.
alter table public.notifications alter column kind drop default;

alter table public.notifications alter column item_id drop not null;

-- Chaque genre dit ce qu il doit porter, et ce qu il ne doit pas porter. La
-- seconde moitie compte autant : une notification d appartenance qui nommerait
-- aussi une tache serait deux notifications dans une ligne.
--
-- Le genre porte le nom de l evenement qui le produit, sans sa version :
-- 'item.created' pour 'item.created.v1', 'membership.created' pour
-- 'membership.created.v1'. Deux vocabulaires pour une meme chose finiraient par
-- diverger, et c est au lecteur du code qu il en couterait.
alter table public.notifications
  add constraint notifications_kind_chk check (
    (kind = 'item.created'         and item_id    is not null and project_id is null)
    or
    (kind = 'membership.created'   and project_id is not null and item_id    is null)
  );

-- Le genre nomme, puisque le defaut n existe plus.
--
-- Ce qui est repris de la version du 11 septembre, sans rien y ajouter : les
-- deux blocs separes -- une violation de cle etrangere laisse la revendication
-- en place, sinon l evenement reviendrait indefiniment pour un effet
-- impossible -- et le `search_path` vide, tous les identifiants etant qualifies.
--
-- Ce qui n est pas repris parce qu il n a jamais existe : `security definer`.
-- Le commentaire de 20260910100000 affirme que cette fonction l est et
-- contourne RLS ; c est faux depuis sa creation le 10 septembre. Le
-- comportement est correct -- le consommateur appelle avec la cle service-role,
-- qui contourne RLS de toute facon -- mais on ne reecrit pas une migration
-- appliquee, donc la correction est ici, ou un lecteur de cette fonction la
-- trouvera.
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
    insert into public.notifications (event_id, user_id, item_id, kind)
    values (p_event_id, p_user_id, p_item_id, 'item.created');
  exception
    when foreign_key_violation then
      -- La tache n existe plus. Rien a notifier, et l evenement reste marque.
      return true;
  end;

  return true;
end
$$;
