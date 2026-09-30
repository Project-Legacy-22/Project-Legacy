-- Migration:  20260925093000_preserve_invitations_on_inviter_erasure
-- Purpose:    An invitation, and the notification it produced for the person
--             invited, must not disappear when the account that sent it is
--             erased (#425). project_invitations.invited_by was
--             `on delete cascade`: erasing the inviter deleted the invitation,
--             which cascaded through notifications.invitation_id and took the
--             invitee's notification down with it, even inside a project that
--             survives the erasure (ADR-0021). Only the link to who sent the
--             invitation is broken now, the same anonymisation as items.user_id.
-- IRREVERSIBLE: invited_by set to null on erasure cannot be traced back to the
--             erased account afterwards, by construction.
-- Rollback:
--   alter table public.project_invitations drop constraint project_invitations_invited_by_fkey;
--   alter table public.project_invitations add constraint project_invitations_invited_by_fkey
--     foreign key (invited_by) references public.users (id) on delete cascade;
--   alter table public.project_invitations alter column invited_by set not null;

alter table public.project_invitations alter column invited_by drop not null;

alter table public.project_invitations drop constraint project_invitations_invited_by_fkey;
alter table public.project_invitations add constraint project_invitations_invited_by_fkey
  foreign key (invited_by) references public.users (id) on delete set null;
