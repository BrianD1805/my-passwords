-- My Passwords Ver-0.041
-- Production onboarding and trial lifecycle foundation.
-- Additive migration only. It does not delete or replace encrypted vault data,
-- cloud snapshots, document blobs, tenants, users or Emergency Access records.

begin;

alter table public.tenants
  add column if not exists trial_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.users
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists welcome_email_sent_at timestamptz;

create index if not exists idx_tenants_trial_lifecycle
  on public.tenants(plan_status, account_status, trial_ends_at);

create index if not exists idx_tenants_onboarding_completed
  on public.tenants(onboarding_completed_at);

create index if not exists idx_users_onboarding_completed
  on public.users(onboarding_completed_at);

-- Keep the Founder account permanently exempt from normal trial enforcement.
update public.tenants
set
  plan_code = 'founder_private',
  plan_status = 'founder_active',
  account_status = 'active',
  status = 'active',
  tenant_role = 'founder_first_tenant',
  trial_started_at = null,
  trial_ends_at = null,
  updated_at = now()
where plan_code in ('founder_private', 'private_founder')
   or plan_status = 'founder_active'
   or tenant_role = 'founder_first_tenant';

-- Backfill trial start dates only where a trial already has a known end date.
-- This does not start or extend any trial.
update public.tenants t
set trial_started_at = coalesce(
  t.trial_started_at,
  s.trial_started_at,
  t.created_at
)
from public.tenant_subscriptions s
where s.tenant_id = t.id
  and t.trial_ends_at is not null
  and t.trial_started_at is null;

update public.tenant_subscriptions s
set
  trial_started_at = coalesce(s.trial_started_at, t.trial_started_at),
  trial_ends_at = coalesce(s.trial_ends_at, t.trial_ends_at),
  updated_at = now()
from public.tenants t
where t.id = s.tenant_id
  and (s.trial_started_at is null or s.trial_ends_at is null)
  and (t.trial_started_at is not null or t.trial_ends_at is not null);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.tenants to service_role;
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select, insert, update, delete on public.tenant_subscriptions to service_role;
grant select, insert, update, delete on public.billing_events to service_role;

commit;
