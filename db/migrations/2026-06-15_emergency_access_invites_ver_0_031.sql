-- My Passwords Ver-0.031
-- Emergency Access invite foundation.
-- Safe foundation only. This does not store master passwords and does not release vault access.

create table if not exists public.emergency_access_invitations (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  relationship text,
  waiting_period text not null default '7 days',
  access_scope text not null default 'Emergency Info folder only',
  status text not null default 'pending',
  invite_token_hash text not null,
  invite_url text,
  email_provider text,
  email_provider_id text,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.emergency_access_invitations enable row level security;

create index if not exists idx_emergency_access_invites_tenant_user
  on public.emergency_access_invitations(tenant_id, user_id, created_at desc);

create index if not exists idx_emergency_access_invites_contact_email
  on public.emergency_access_invitations(contact_email);

create index if not exists idx_emergency_access_invites_token_hash
  on public.emergency_access_invitations(invite_token_hash);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.emergency_access_invitations to service_role;
