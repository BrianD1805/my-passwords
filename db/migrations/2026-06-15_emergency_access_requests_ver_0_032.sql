-- My Passwords Ver-0.032
-- Emergency Access request foundation.
-- Safe foundation only. This does not store master passwords and does not release vault access.

create table if not exists public.emergency_access_requests (
  id text primary key,
  invitation_id text not null references public.emergency_access_invitations(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  contact_email text not null,
  contact_name text not null,
  waiting_period text not null default '7 days',
  access_scope text not null default 'Emergency Info folder only',
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  waiting_ends_at timestamptz,
  owner_notified_at timestamptz,
  cancelled_at timestamptz,
  released_at timestamptz,
  email_provider text,
  email_provider_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.emergency_access_requests enable row level security;

create index if not exists idx_emergency_access_requests_invitation
  on public.emergency_access_requests(invitation_id, requested_at desc);

create index if not exists idx_emergency_access_requests_tenant_user
  on public.emergency_access_requests(tenant_id, user_id, requested_at desc);

create index if not exists idx_emergency_access_requests_status
  on public.emergency_access_requests(status, waiting_ends_at);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.emergency_access_requests to service_role;
