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
