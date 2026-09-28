-- Migration: 20260928100000_drop_item_assignee_column
-- Purpose: Drop items.assignee_id, replaced by item_assignees since #419 (#421).
-- Reversible: yes, as 20260924120000_item_assignee wrote it, with one assignee
--             per task at most: a task assigned to several members cannot be
--             put back into one column without choosing one of them.
--
-- The second step of ADR-0019. 20260924140000_item_assignees copied the column
-- into item_assignees and left it in place, unread, until the code that stops
-- reading it was released; #422 is in main since release #424. This migration
-- reaches the hosted database, shared by production and previews, as soon as
-- ci passes on dev: it is safe only because no released code reads the column.

-- Nothing writes the column since #419, so the copy made then should hold
-- every value. Copying again costs nothing and turns "should" into "does":
-- a value missed then is not lost with the column. A non-null value still
-- names a membership, since its key sets it to null when the membership goes.
insert into public.item_assignees (item_id, project_id, user_id)
select id, project_id, assignee_id
from public.items
where assignee_id is not null
on conflict (item_id, user_id) do nothing;

drop index public.items_project_assignee_idx;

alter table public.items drop constraint items_assignee_membership_fkey;

alter table public.items drop column assignee_id;
