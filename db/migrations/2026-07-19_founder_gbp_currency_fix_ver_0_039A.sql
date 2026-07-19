-- My Passwords Ver-0.039A
-- Founder account correction and global GBP currency.
-- Safe corrective migration: preserves tenant IDs, user IDs, encrypted vault data,
-- documents, snapshots and Emergency Access records.

begin;

alter table public.subscription_plans
  alter column currency set default 'GBP';

alter table public.tenant_subscriptions
  alter column currency set default 'GBP';

update public.subscription_plans
set currency = 'GBP', updated_at = now()
where currency is distinct from 'GBP';

update public.tenant_subscriptions
set currency = 'GBP', updated_at = now()
where currency is distinct from 'GBP';

update public.billing_events
set currency = 'GBP'
where currency is null or currency = 'ZAR';

with founder_tenant as (
  select id
  from public.tenants
  where lower(coalesce(account_name, name, '')) = lower('Brian Private Vault')
  order by created_at asc nulls last, id asc
  limit 1
)
update public.tenants
set
  plan = 'private_founder',
  status = 'active',
  plan_code = 'founder_private',
  plan_status = 'founder_active',
  account_status = 'active',
  tenant_role = 'founder_first_tenant',
  trial_ends_at = null,
  updated_at = now()
where id in (select id from founder_tenant);

insert into public.tenant_subscriptions (
  id,
  tenant_id,
  plan_code,
  status,
  billing_interval,
  currency,
  price_minor,
  trial_started_at,
  trial_ends_at,
  current_period_start,
  current_period_end,
  cancel_at_period_end,
  cancelled_at,
  grace_period_ends_at,
  provider,
  provider_customer_id,
  provider_subscription_id,
  provider_price_id,
  last_payment_at,
  last_payment_failed_at,
  admin_override,
  metadata,
  created_at,
  updated_at
)
select
  'subscription_founder_private',
  id,
  'founder_private',
  'founder_active',
  null,
  'GBP',
  0,
  null,
  null,
  null,
  null,
  false,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  true,
  jsonb_build_object('version', 'My Passwords Ver-0.039A', 'founder_account', true),
  now(),
  now()
from public.tenants
where lower(coalesce(account_name, name, '')) = lower('Brian Private Vault')
order by created_at asc nulls last, id asc
limit 1
on conflict (tenant_id) do update set
  plan_code = excluded.plan_code,
  status = excluded.status,
  billing_interval = null,
  currency = 'GBP',
  price_minor = 0,
  trial_started_at = null,
  trial_ends_at = null,
  current_period_start = null,
  current_period_end = null,
  cancel_at_period_end = false,
  cancelled_at = null,
  grace_period_ends_at = null,
  provider = null,
  provider_customer_id = null,
  provider_subscription_id = null,
  provider_price_id = null,
  last_payment_at = null,
  last_payment_failed_at = null,
  admin_override = true,
  metadata = coalesce(tenant_subscriptions.metadata, '{}'::jsonb)
    || jsonb_build_object('version', 'My Passwords Ver-0.039A', 'founder_account', true),
  updated_at = now();

grant usage on schema public to service_role;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select, insert, update, delete on public.tenant_subscriptions to service_role;
grant select, insert, update, delete on public.billing_events to service_role;

commit;

select account_name, plan_code, plan_status, account_status, tenant_role, trial_ends_at
from public.tenants
where lower(coalesce(account_name, name, '')) = lower('Brian Private Vault');

select code, display_name, currency
from public.subscription_plans
order by display_order, display_name;
