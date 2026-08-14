-- Password-Encrypt Ver-1.005.02
-- Emergency Package Import Code lookup.
--
-- The readable Import Code is never stored in the database. Password-Encrypt
-- stores only its SHA-256 hash so a released package can be matched after the
-- nominated Password-Encrypt user enters the code inside their own vault.

begin;

alter table public.emergency_access_invitations
  add column if not exists emergency_import_code_hash text;

create unique index if not exists idx_emergency_access_invites_import_code_hash
  on public.emergency_access_invitations(emergency_import_code_hash)
  where emergency_import_code_hash is not null
    and emergency_import_code_hash <> '';

-- Existing service_role grants on emergency_access_invitations remain in force.
-- Browser roles receive no direct access to this table.
revoke all on table public.emergency_access_invitations from anon, authenticated;
grant select, insert, update, delete on public.emergency_access_invitations to service_role;

commit;
