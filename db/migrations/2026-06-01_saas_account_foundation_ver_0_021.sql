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
