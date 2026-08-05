-- My Passwords Ver-0.047
-- Production SMS integration delivery log.
-- Additive migration only. Existing encrypted vault data and account records are unchanged.

begin;

create table if not exists public.sms_delivery_log (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  challenge_id text references public.otp_challenges(id) on delete set null,
  provider text not null default 'twilio',
  provider_reference text,
  purpose text not null,
  destination_masked text,
  status text not null default 'pending',
  error_code text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sms_delivery_log enable row level security;

create index if not exists idx_sms_delivery_log_tenant_created
  on public.sms_delivery_log(tenant_id, created_at desc);

create index if not exists idx_sms_delivery_log_user_created
  on public.sms_delivery_log(user_id, created_at desc);

create index if not exists idx_sms_delivery_log_challenge
  on public.sms_delivery_log(challenge_id);

create index if not exists idx_sms_delivery_log_provider_reference
  on public.sms_delivery_log(provider, provider_reference);

create index if not exists idx_sms_delivery_log_status_created
  on public.sms_delivery_log(status, created_at desc);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.sms_delivery_log to service_role;

commit;
