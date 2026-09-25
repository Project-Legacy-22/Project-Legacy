-- Migration:  20260925090000_preserve_shared_project_items_on_erasure
-- Purpose:    Account erasure in a shared project no longer takes the other
--             members' work with it. A task created by someone who then
--             deletes their account keeps existing for the project's
--             remaining members, with its creator link broken rather than the
--             row removed. A project this person owned alone, with other
--             members left, keeps an owner: reassigned to whoever has been a
--             member the longest, in absence of any other written rule.
-- IRREVERSIBLE: item.user_id set to null on erasure cannot be traced back to
--             the erased account afterwards, by construction.
-- Rollback:
--   alter table public.items drop constraint items_user_id_fkey;
--   alter table public.items add constraint items_user_id_fkey
--     foreign key (user_id) references public.users (id) on delete cascade;
--   alter table public.items alter column user_id set not null;
--   -- erase_account reverts to the definition in
--   -- 20260908144244_extend_account_erasure_for_projects.sql

-- A task survives its creator's erasure; only the link naming them breaks.
-- Rows written before this migration are unaffected until a future erasure
-- touches them.
alter table public.items alter column user_id drop not null;

alter table public.items drop constraint items_user_id_fkey;
alter table public.items add constraint items_user_id_fkey
  foreign key (user_id) references public.users (id) on delete set null;

create or replace function public.erase_account(p_user_id uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.processed_events
  where event_id in (
    select id from public.outbox where payload ->> 'ownerId' = p_user_id::text
  );

  delete from public.outbox
  where payload ->> 'ownerId' = p_user_id::text;

  -- Must run before the project-deletion step below and before deleting
  -- users cascades away this account's memberships: both would otherwise
  -- remove the fact that this account was ever the sole owner, and a project
  -- that keeps other members would be left with none.
  --
  -- The member who has belonged the longest becomes the new owner. Written
  -- here for lack of a rule recorded anywhere else; revisit if the team
  -- settles a different one.
  update public.project_memberships new_owner
  set role = 'owner'
  where new_owner.user_id = (
    select other_membership.user_id
    from public.project_memberships other_membership
    where other_membership.project_id = new_owner.project_id
      and other_membership.user_id <> p_user_id
    order by other_membership.created_at
    limit 1
  )
    and new_owner.project_id in (
      select membership.project_id
      from public.project_memberships membership
      where membership.user_id = p_user_id
        and membership.role = 'owner'
        and not exists (
          select 1
          from public.project_memberships co_owner
          where co_owner.project_id = membership.project_id
            and co_owner.user_id <> p_user_id
            and co_owner.role = 'owner'
        )
        and exists (
          select 1
          from public.project_memberships other_member
          where other_member.project_id = membership.project_id
            and other_member.user_id <> p_user_id
        )
    );

  -- This must happen before deleting users: the membership foreign key
  -- cascades, after which there would be no way to distinguish a project that
  -- just lost its last member from an already ownerless project.
  delete from public.projects project
  where exists (
    select 1
    from public.project_memberships membership
    where membership.project_id = project.id
      and membership.user_id = p_user_id
  )
    and not exists (
      select 1
      from public.project_memberships other_membership
      where other_membership.project_id = project.id
        and other_membership.user_id <> p_user_id
    );

  -- Cascades to this account's remaining memberships and its own
  -- notifications. items.user_id is set to null rather than cascading: a
  -- shared project's tasks survive with an anonymous creator. Shared projects
  -- themselves survive because another membership still references them.
  delete from public.users where id = p_user_id;
end
$$;
