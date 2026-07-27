-- My Passwords Ver-0.042
-- Stripe Billing recurring subscription checkout.
-- Additive only. Does not alter encrypted vault snapshots, documents,
-- Emergency Access records, tenant IDs or user IDs.

begin;

alter table public.subscription_plans
  add column if not exists stripe_product_id text,
  add column if not exists stripe_monthly_price_id text,
  add column if not exists stripe_quarterly_price_id text,
  add column if not exists stripe_annual_price_id text,
  add column if not exists stripe_sync_status text not null default 'not_synced',
  add column if not exists stripe_sync_message text not null default '',
  add column if not exists stripe_synced_at timestamptz;

alter table public.tenant_subscriptions
  add column if not exists checkout_session_id text,
  add column if not exists latest_invoice_id text;

create unique index if not exists idx_subscription_plans_stripe_product_unique
  on public.subscription_plans(stripe_product_id)
  where stripe_product_id is not null and stripe_product_id <> '';

create unique index if not exists idx_subscription_plans_stripe_monthly_price_unique
  on public.subscription_plans(stripe_monthly_price_id)
  where stripe_monthly_price_id is not null and stripe_monthly_price_id <> '';

create unique index if not exists idx_subscription_plans_stripe_quarterly_price_unique
  on public.subscription_plans(stripe_quarterly_price_id)
  where stripe_quarterly_price_id is not null and stripe_quarterly_price_id <> '';

create unique index if not exists idx_subscription_plans_stripe_annual_price_unique
  on public.subscription_plans(stripe_annual_price_id)
  where stripe_annual_price_id is not null and stripe_annual_price_id <> '';

create unique index if not exists idx_tenant_subscriptions_stripe_customer_unique
  on public.tenant_subscriptions(provider_customer_id)
  where provider = 'stripe' and provider_customer_id is not null and provider_customer_id <> '';

create unique index if not exists idx_tenant_subscriptions_stripe_subscription_unique
  on public.tenant_subscriptions(provider_subscription_id)
  where provider = 'stripe' and provider_subscription_id is not null and provider_subscription_id <> '';

create index if not exists idx_tenant_subscriptions_checkout_session
  on public.tenant_subscriptions(checkout_session_id)
  where checkout_session_id is not null and checkout_session_id <> '';

create index if not exists idx_tenant_subscriptions_provider_status
  on public.tenant_subscriptions(provider, status, current_period_end);

update public.subscription_plans
set stripe_sync_status = case
      when coalesce(stripe_product_id, '') <> '' then 'review_required'
      else 'not_synced'
    end,
    stripe_sync_message = case
      when coalesce(stripe_product_id, '') <> '' then 'Save or sync this plan in Admin to verify its Stripe Prices.'
      else 'Save this plan in Admin after Stripe is configured.'
    end,
    updated_at = now()
where stripe_sync_status is null
   or stripe_sync_status = '';

grant usage on schema public to service_role;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select, insert, update, delete on public.tenant_subscriptions to service_role;
grant select, insert, update, delete on public.billing_events to service_role;
grant select, insert, update, delete on public.tenants to service_role;
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.audit_log to service_role;

commit;
