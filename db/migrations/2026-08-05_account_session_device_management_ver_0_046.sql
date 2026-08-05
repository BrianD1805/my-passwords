-- My Passwords Ver-0.046
-- Account, session and device management foundation.
-- Additive migration only. Existing encrypted vault data, snapshots, document blobs,
-- subscriptions and Emergency Access records are not changed or deleted.

begin;

alter table public.users
  add column if not exists session_generation integer not null default 1,
  add column if not exists account_recovery_last_verified_at timestamptz;

alter table public.tenants
  add column if not exists deletion_status text not null default 'none',
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

create table if not exists public.account_devices (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  client_device_id text not null,
  device_name text not null default 'Verified device',
  device_type text not null default 'browser',
  platform text not null default '',
  browser text not null default '',
  user_agent text not null default '',
  first_verified_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_device_id)
);

create table if not exists public.account_sessions (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  device_id text not null references public.account_devices(id) on delete cascade,
  session_generation integer not null default 1,
  status text not null default 'active',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  renewed_at timestamptz,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_reason text,
  user_agent text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_contact_changes (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  change_type text not null,
  previous_value text,
  requested_value text not null,
  phone_country_code text,
  phone_number text,
  challenge_id text references public.otp_challenges(id) on delete set null,
  status text not null default 'pending_verification',
  requested_at timestamptz not null default now(),
  expires_at timestamptz,
  verified_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  user_id text references public.users(id) on delete set null,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at timestamptz,
  completed_at timestamptz,
  reason text,
  contact_email_masked text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_devices enable row level security;
alter table public.account_sessions enable row level security;
alter table public.account_contact_changes enable row level security;
alter table public.account_deletion_requests enable row level security;

create index if not exists idx_account_devices_user_seen
  on public.account_devices(user_id, last_seen_at desc);

create index if not exists idx_account_devices_tenant_active
  on public.account_devices(tenant_id, revoked_at, last_seen_at desc);

create index if not exists idx_account_sessions_user_active
  on public.account_sessions(user_id, status, expires_at desc);

create index if not exists idx_account_sessions_device_active
  on public.account_sessions(device_id, status, expires_at desc);

create index if not exists idx_account_contact_changes_user_created
  on public.account_contact_changes(user_id, created_at desc);

create index if not exists idx_account_deletion_requests_due
  on public.account_deletion_requests(status, scheduled_for);

create unique index if not exists idx_account_deletion_requests_one_pending
  on public.account_deletion_requests(tenant_id)
  where status = 'pending';

grant usage on schema public to service_role;
grant select, insert, update, delete on public.account_devices to service_role;
grant select, insert, update, delete on public.account_sessions to service_role;
grant select, insert, update, delete on public.account_contact_changes to service_role;
grant select, insert, update, delete on public.account_deletion_requests to service_role;
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.tenants to service_role;

commit;
