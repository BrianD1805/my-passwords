-- My Passwords Ver-0.011 Supabase schema
-- Run this in Supabase SQL Editor for the project used by the Netlify app.

create table if not exists public.tenants (
  id text primary key,
  name text not null unique,
  plan text not null default 'private_founder',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  email text not null default '',
  display_name text not null,
  role text not null default 'member',
  status text not null default 'active',
  phone_country_code text,
  phone_number text,
  phone_e164 text,
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  account_login_method text not null default 'local_first',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create unique index if not exists idx_users_phone_e164_unique
  on public.users(phone_e164)
  where phone_e164 is not null and phone_e164 <> '';

create index if not exists idx_users_email on public.users(email);


create table if not exists public.categories (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  name text not null,
  icon text not null default 'folder',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.vault_items (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  owner_user_id text not null references public.users(id) on delete cascade,
  category_id text references public.categories(id) on delete set null,
  title text not null,
  encrypted_payload text not null,
  favourite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_sync_snapshots (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  encrypted_blob text not null,
  local_salt text not null,
  local_iv text not null,
  item_count integer not null default 0,
  client_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_users (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  owner_user_id text not null references public.users(id) on delete cascade,
  emergency_user_email text not null,
  status text not null default 'invited',
  access_level text not null default 'none_until_approved',
  waiting_period_days integer not null default 14,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_requests (
  id text primary key,
  emergency_user_id text not null references public.emergency_users(id) on delete cascade,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  unlock_after timestamptz,
  cancelled_at timestamptz,
  approved_at timestamptz
);

create table if not exists public.audit_log (
  id text primary key,
  tenant_id text references public.tenants(id) on delete cascade,
  user_id text references public.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_tenant_id on public.users(tenant_id);
create index if not exists idx_categories_tenant_id on public.categories(tenant_id);
create index if not exists idx_vault_items_tenant_id on public.vault_items(tenant_id);
create index if not exists idx_vault_sync_snapshots_tenant_user_created on public.vault_sync_snapshots(tenant_id, user_id, created_at desc);
create index if not exists idx_audit_log_tenant_created on public.audit_log(tenant_id, created_at desc);

-- Keep Row Level Security disabled for this foundation build because all writes are server-side
-- through Netlify Functions using the Supabase service role key. Do not expose the service role key
-- to frontend/browser code. RLS policies should be added when proper Supabase Auth is introduced.
-- My Passwords Ver-0.013A
-- OTP foundation for new-device restore, test-mode only.
-- Safe, additive migration. Does not alter existing vault snapshots or encryption data.

create table if not exists public.otp_challenges (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  purpose text not null default 'new_device_restore_test',
  delivery_channel text not null default 'sms_test',
  destination text not null,
  destination_masked text,
  otp_hash text not null,
  status text not null default 'pending_test',
  attempts integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.otp_challenges enable row level security;

create index if not exists idx_otp_challenges_tenant_user
  on public.otp_challenges(tenant_id, user_id, created_at desc);

create index if not exists idx_otp_challenges_status_expires
  on public.otp_challenges(status, expires_at);

create index if not exists idx_otp_challenges_destination
  on public.otp_challenges(destination);

alter table public.users
  add column if not exists otp_test_last_verified_at timestamptz,
  add column if not exists otp_test_status text not null default 'not_verified';

-- My Passwords Ver-0.020
-- Encrypted external document storage foundation.
-- Document file content is encrypted in the browser before upload.

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

grant usage on schema public to service_role;
grant select, insert, update, delete on public.document_blobs to service_role;
-- My Passwords Ver-0.021
-- SaaS landing page and first-time account onboarding foundation.
-- Safe, additive migration only. Does not alter encrypted vault snapshots or document blobs.

alter table public.tenants
  add column if not exists account_name text,
  add column if not exists plan_code text not null default 'personal_free',
  add column if not exists plan_status text not null default 'trial_pending',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists account_status text not null default 'active',
  add column if not exists tenant_role text not null default 'primary_owner';

alter table public.users
  add column if not exists onboarding_status text not null default 'account_foundation_ready',
  add column if not exists first_tenant_owner boolean not null default false,
  add column if not exists last_onboarding_step text;

update public.tenants
set
  account_name = coalesce(account_name, name),
  plan_code = coalesce(nullif(plan_code, ''), plan, 'personal_free'),
  plan_status = coalesce(nullif(plan_status, ''), case when plan = 'private_founder' then 'founder_active' else 'trial_pending' end),
  account_status = coalesce(nullif(account_status, ''), status, 'active'),
  tenant_role = coalesce(nullif(tenant_role, ''), 'primary_owner')
where account_name is null
   or plan_code is null
   or plan_status is null
   or account_status is null
   or tenant_role is null;

create index if not exists idx_tenants_plan_status
  on public.tenants(plan_code, plan_status, account_status);

create index if not exists idx_users_onboarding_status
  on public.users(onboarding_status);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.tenants to service_role;
grant select, insert, update, delete on public.users to service_role;

-- My Passwords Ver-0.039
-- SaaS authentication, tenant isolation and single-site admin foundation.
-- Apply db/migrations/2026-07-18_saas_auth_admin_subscription_foundation_ver_0_039.sql
-- to add subscription_plans, tenant_subscriptions, billing_events and users.last_login_at.


-- My Passwords Ver-0.039E
-- Apply db/migrations/2026-07-19_founder_gbp_currency_fix_ver_0_039A.sql
-- to restore the first tenant Founder Plan and make GBP the global subscription currency.

-- My Passwords Ver-0.039E
-- UI-only FAQ and vault login refinements. No database migration required.
