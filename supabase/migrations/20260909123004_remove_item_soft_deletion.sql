-- Migration:  20260909123004_remove_item_soft_deletion
-- Purpose:    Make item deletion permanent by removing the unused soft-delete
--             column and its partial-index predicate. An item is either stored
--             and visible to its project members, or physically absent.
-- Reversible: no. The column could be recreated, but values removed with it
--             and items physically deleted afterwards cannot be reconstructed.

drop index public.items_project_id_created_at_idx;

alter table public.items
  drop column deleted_at;

create index items_project_id_created_at_idx
  on public.items (project_id, created_at desc, id desc);
