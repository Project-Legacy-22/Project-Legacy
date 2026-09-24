-- Migration: 20260924120000_item_assignee
-- Purpose: Let a task be assigned to a member of its project (US-58, #348).
-- Reversible: yes. Drop the index, the constraint, then the column; the
--             assignments are lost with it, the tasks are not.
--
-- user_id stays what it is, the creator of the task. The assignee is a
-- second, optional person, and confusing the two would lose who created it.

alter table public.items add column assignee_id uuid;

-- The assignee is a membership, not an account: the key points at
-- (project_id, user_id) of project_memberships, so the database refuses a
-- person outside the project, whatever the code above it checks.
--
-- `set null (assignee_id)` rather than a column the removal function clears:
-- deleting the membership -- removing a member, erasing an account, deleting
-- the project -- leaves the task unassigned in the same statement, and the
-- task itself stays. This is what remove_project_member's note for #348 asked
-- for, and the key lock taken by the check makes an assignment racing a
-- removal wait for it instead of pointing at a membership that is gone.
alter table public.items
  add constraint items_assignee_membership_fkey
  foreign key (project_id, assignee_id)
  references public.project_memberships (project_id, user_id)
  on delete set null (assignee_id);

-- The referencing side of that key: without it, removing a member scans every
-- task of the project to find the ones to unassign.
create index items_project_assignee_idx
  on public.items (project_id, assignee_id)
  where assignee_id is not null;
