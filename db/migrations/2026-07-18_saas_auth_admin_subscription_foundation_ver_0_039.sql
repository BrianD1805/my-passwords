-- My Passwords Ver-0.039
-- SaaS authentication, tenant isolation and single-site admin foundation.
-- Safe additive migration. It does not delete or alter encrypted vault snapshots,
-- document blobs, Emergency Access data, users or existing tenant IDs.

begin;

alter table public.users
  add column if not exists last_login_at timestamptz;

create table if not exists public.subscription_plans (
  id text primary key,
  code text not null unique,
  display_name text not null,
  description text not null default '',
  currency text not null default 'GBP',
  monthly_price_minor integer not null default 0 check (monthly_price_minor >= 0),
  quarterly_price_minor integer not null default 0 check (quarterly_price_minor >= 0),
  annual_price_minor integer not null default 0 check (annual_price_minor >= 0),
  trial_days integer not null default 0 check (trial_days >= 0),
  max_users integer not null default 1 check (max_users >= 1),
  storage_limit_mb integer not null default 0 check (storage_limit_mb >= 0),
  document_limit integer not null default 0 check (document_limit >= 0),
  features jsonb not null default '[]'::jsonb,
  is_featured boolean not null default false,
  is_public boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_subscriptions (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  plan_code text not null,
  status text not null default 'trial_pending',
  billing_interval text,
  currency text not null default 'GBP',
  price_minor integer not null default 0 check (price_minor >= 0),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  grace_period_ends_at timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  provider_price_id text,
  last_payment_at timestamptz,
  last_payment_failed_at timestamptz,
  admin_override boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists public.billing_events (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  subscription_id text references public.tenant_subscriptions(id) on delete set null,
  provider text,
  provider_event_id text,
  event_type text not null,
  status text not null default 'recorded',
  amount_minor integer,
  currency text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_billing_events_provider_event_unique
  on public.billing_events(provider, provider_event_id)
  where provider_event_id is not null and provider_event_id <> '';

create index if not exists idx_subscription_plans_public_order
  on public.subscription_plans(is_public, is_active, display_order);

create index if not exists idx_tenant_subscriptions_status
  on public.tenant_subscriptions(status, current_period_end);

create index if not exists idx_billing_events_tenant_created
  on public.billing_events(tenant_id, created_at desc);

insert into public.subscription_plans (
  id, code, display_name, description, currency,
  monthly_price_minor, quarterly_price_minor, annual_price_minor,
  trial_days, max_users, storage_limit_mb, document_limit,
  features, is_featured, is_public, is_active, display_order
) values
  ('plan_personal', 'personal', 'Personal', 'A private encrypted vault for one person.', 'GBP', 0, 0, 0, 14, 1, 0, 0,
   '["Encrypted password vault", "Secure device unlock", "Encrypted cloud backup", "Emergency Access"]'::jsonb,
   true, false, true, 10),
  ('plan_family', 'family', 'Family', 'A future household plan with additional users and sharing controls.', 'GBP', 0, 0, 0, 14, 5, 0, 0,
   '["Everything in Personal", "Multiple household users", "Family sharing controls"]'::jsonb,
   false, false, true, 20),
  ('plan_business', 'business', 'Business', 'A future team plan for controlled business vault access.', 'GBP', 0, 0, 0, 14, 10, 0, 0,
   '["Everything in Personal", "Team user management", "Business access controls"]'::jsonb,
   false, false, true, 30)
on conflict (code) do nothing;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select, insert, update, delete on public.tenant_subscriptions to service_role;
grant select, insert, update, delete on public.billing_events to service_role;

commit;
