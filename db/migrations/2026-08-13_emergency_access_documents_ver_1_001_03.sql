-- Password-Encrypt Ver-1.001.03
-- Emergency Access document copies.
--
-- Stored document files are decrypted only inside the owner's unlocked browser,
-- then re-encrypted for the Trusted Person invite token before upload. The server
-- stores only the re-encrypted emergency copy and file metadata.

begin;

create table if not exists public.emergency_access_documents (
  id text primary key,
  invitation_id text not null references public.emergency_access_invitations(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  source_document_id text not null,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_extension text not null default '',
  file_size bigint not null default 0 check (file_size >= 0),
  encrypted_blob text not null,
  local_salt text not null,
  local_iv text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, source_document_id)
);

create index if not exists idx_emergency_access_documents_invitation
  on public.emergency_access_documents(invitation_id, updated_at desc);

create index if not exists idx_emergency_access_documents_owner
  on public.emergency_access_documents(tenant_id, user_id, updated_at desc);

alter table public.emergency_access_documents enable row level security;

revoke all on table public.emergency_access_documents from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.emergency_access_documents to service_role;

commit;
