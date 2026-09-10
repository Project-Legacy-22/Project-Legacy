-- Migration:  20260910110000_record_policy_consent
-- Purpose:    Record which version of the privacy policy an account agreed to,
--             and when. US-37 requires the consent to be stored with the
--             account, so it is written by the mirror trigger from the metadata
--             the sign-up carried: the same transaction that creates the
--             account records the consent, and neither can exist alone.
--             Reading it from auth.users rather than accepting a second write
--             from the API is what makes that guarantee: an account created by
--             any other path -- a future provider, an administrator in the
--             dashboard -- lands with a null consent that a query can find,
--             instead of silently looking consented.
-- Reversible: yes.
-- Rollback:
--   alter table public.users
--     drop column if exists policy_version,
--     drop column if exists policy_accepted_at;
--   -- then restore the previous definition of public.mirror_auth_user()
--   -- from 20260904103000_authentication_and_row_level_security.

alter table public.users
  -- Nullable on purpose. Accounts created before this migration never agreed to
  -- anything, and claiming otherwise by backfilling a version would be a lie
  -- written into the record that US-37 exists to keep honest.
  add column policy_version    text,
  add column policy_accepted_at timestamptz;

-- Finds the accounts that predate the consent record, or that arrived through a
-- path which does not carry it. A partial index rather than a plain one: the
-- rows without consent are the only ones anybody looks for.
create index users_without_policy_consent_idx
  on public.users (id)
  where policy_version is null;

-- Extends the mirror rather than adding a trigger beside it. Two triggers on
-- the same insert could half-succeed, and an account whose consent failed to
-- record is exactly what must not happen.
--
-- Only the columns this migration adds change. Anything else the mirror does
-- belongs to the migration that put it there, and rewriting it here would
-- silently revert whatever landed in between.
create or replace function public.mirror_auth_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  consented_version text;
begin
  -- Written by the sign-up as user metadata. Absent for any other path, which
  -- leaves the columns null rather than inventing a consent.
  consented_version := new.raw_user_meta_data ->> 'policy_version';

  insert into public.users (id, email, policy_version, policy_accepted_at)
  values (
    new.id,
    new.email,
    consented_version,
    case when consented_version is null then null else now() end
  )
  on conflict (id) do update set email = excluded.email;

  return new;
end
$$;
