-- My Passwords Ver-0.020
-- Encrypted external document storage foundation.
-- Safe, additive migration. Does not modify existing vault snapshots or existing document items.
-- Document file content is encrypted in the browser before being sent here.

create table if not exists public.document_blobs (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  file_name text not null,
  file_type text not null default 'application/octet-stream',
  file_extension text,
  file_size integer not null default 0,
  encrypted_blob text not null,
  local_salt text not null,
  local_iv text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_blobs enable row level security;

create index if not exists idx_document_blobs_tenant_user
  on public.document_blobs(tenant_id, user_id, updated_at desc);

create index if not exists idx_document_blobs_user_id
  on public.document_blobs(user_id);

-- Explicit grants required for Supabase Data API access through Netlify Functions.
-- Keep this server-side only. Do not grant to anon/authenticated until client-side Supabase Auth is deliberately introduced.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.document_blobs to service_role;
