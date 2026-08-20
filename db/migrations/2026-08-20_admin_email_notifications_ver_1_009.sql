-- Password-Encrypt Ver-1.009
-- Owner/Admin automatic email notifications and customer trial-extension requests.
-- These tables store operational/account metadata only. They never store vault contents,
-- master passwords, OTP codes, document contents or decrypted customer data.

begin;

create table if not exists public.admin_notification_settings (
  id text primary key,
  recipient_email text not null,
  enabled boolean not null default true,
  event_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.admin_notification_settings (
  id,
  recipient_email,
  enabled,
  event_flags
)
values (
  'owner_admin',
  'bdh1805@gmail.com',
  true,
  jsonb_build_object(
    'new_client_onboarded', true,
    'new_subscription_purchased', true,
    'trial_extension_requested', true,
    'payment_failed', true,
    'subscription_cancelled', true,
    'account_deletion_requested', true
  )
)
on conflict (id) do nothing;

create table if not exists public.admin_notification_log (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  user_id text references public.users(id) on delete set null,
  event_type text not null,
  idempotency_key text not null unique,
  recipient_masked text,
  subject text not null default '',
  provider text not null default 'resend',
  provider_reference text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_notification_log_created
  on public.admin_notification_log(created_at desc);
create index if not exists idx_admin_notification_log_type_created
  on public.admin_notification_log(event_type, created_at desc);
create index if not exists idx_admin_notification_log_tenant_created
  on public.admin_notification_log(tenant_id, created_at desc);
create index if not exists idx_admin_notification_log_status_created
  on public.admin_notification_log(status, created_at desc);

create table if not exists public.trial_extension_requests (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  reason text not null default '',
  trial_ends_at timestamptz,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_trial_extension_requests_one_pending
  on public.trial_extension_requests(tenant_id)
  where status = 'pending';
create index if not exists idx_trial_extension_requests_tenant_created
  on public.trial_extension_requests(tenant_id, created_at desc);
create index if not exists idx_trial_extension_requests_status_created
  on public.trial_extension_requests(status, created_at desc);

alter table public.admin_notification_settings enable row level security;
alter table public.admin_notification_log enable row level security;
alter table public.trial_extension_requests enable row level security;

revoke all on table public.admin_notification_settings from anon, authenticated;
revoke all on table public.admin_notification_log from anon, authenticated;
revoke all on table public.trial_extension_requests from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.admin_notification_settings to service_role;
grant select, insert, update, delete on public.admin_notification_log to service_role;
grant select, insert, update, delete on public.trial_extension_requests to service_role;

commit;
