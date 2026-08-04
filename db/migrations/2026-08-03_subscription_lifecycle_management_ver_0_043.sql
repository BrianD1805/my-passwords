-- My Passwords Ver-0.043
-- Subscription Lifecycle Management.
-- Safe additive migration only. It does not delete or rewrite encrypted vault
-- snapshots, document blobs, Emergency Access records, tenants or users.

begin;

alter table public.tenant_subscriptions
  add column if not exists stripe_schedule_id text,
  add column if not exists scheduled_plan_code text,
  add column if not exists scheduled_billing_interval text,
  add column if not exists scheduled_price_id text,
  add column if not exists scheduled_change_at timestamptz,
  add column if not exists scheduled_change_type text,
  add column if not exists scheduled_change_created_at timestamptz,
  add column if not exists next_invoice_amount_minor integer,
  add column if not exists next_invoice_currency text,
  add column if not exists next_invoice_at timestamptz,
  add column if not exists last_stripe_sync_at timestamptz,
  add column if not exists last_stripe_sync_status text not null default 'not_checked',
  add column if not exists last_stripe_sync_message text not null default '',
  add column if not exists duplicate_subscription_count integer not null default 0,
  add column if not exists duplicate_subscription_ids jsonb not null default '[]'::jsonb;

alter table public.tenant_subscriptions
  drop constraint if exists tenant_subscriptions_next_invoice_amount_nonnegative;

alter table public.tenant_subscriptions
  add constraint tenant_subscriptions_next_invoice_amount_nonnegative
  check (next_invoice_amount_minor is null or next_invoice_amount_minor >= 0);

alter table public.tenant_subscriptions
  drop constraint if exists tenant_subscriptions_duplicate_count_nonnegative;

alter table public.tenant_subscriptions
  add constraint tenant_subscriptions_duplicate_count_nonnegative
  check (duplicate_subscription_count >= 0);

create unique index if not exists idx_tenant_subscriptions_stripe_schedule_unique
  on public.tenant_subscriptions(stripe_schedule_id)
  where stripe_schedule_id is not null and stripe_schedule_id <> '';

create index if not exists idx_tenant_subscriptions_scheduled_change
  on public.tenant_subscriptions(scheduled_change_at)
  where scheduled_change_at is not null;

create index if not exists idx_tenant_subscriptions_stripe_sync_status
  on public.tenant_subscriptions(last_stripe_sync_status, last_stripe_sync_at desc);

create index if not exists idx_billing_events_event_type_created
  on public.billing_events(event_type, created_at desc);

update public.tenant_subscriptions
set
  last_stripe_sync_status = case
    when provider = 'stripe' and coalesce(provider_subscription_id, '') <> '' then 'not_checked'
    else coalesce(nullif(last_stripe_sync_status, ''), 'not_checked')
  end,
  last_stripe_sync_message = case
    when provider = 'stripe' and coalesce(provider_subscription_id, '') <> '' then 'Use Refresh from Stripe to reconcile renewal, schedule and invoice details.'
    else coalesce(last_stripe_sync_message, '')
  end,
  duplicate_subscription_count = coalesce(duplicate_subscription_count, 0),
  duplicate_subscription_ids = coalesce(duplicate_subscription_ids, '[]'::jsonb),
  updated_at = now()
where provider = 'stripe'
   or last_stripe_sync_status is null
   or duplicate_subscription_count is null
   or duplicate_subscription_ids is null;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.tenant_subscriptions to service_role;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select, insert, update, delete on public.billing_events to service_role;
grant select, insert, update, delete on public.tenants to service_role;
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.audit_log to service_role;

commit;
