-- Password-Encrypt Ver-0.053B
-- Add privacy-preserving vault item limits to subscription plans and entitlement snapshots.
-- Zero means unlimited. Existing numbered plans such as "Personal 50" / "Personal 150"
-- are initialised from the trailing number in their display name; Admin can then edit the value.

begin;

alter table public.subscription_plans
  add column if not exists item_limit integer not null default 0;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_item_limit_nonnegative;

alter table public.subscription_plans
  add constraint subscription_plans_item_limit_nonnegative check (item_limit >= 0);

update public.subscription_plans
set entitlement_version = greatest(coalesce(entitlement_version, 1), 2),
    updated_at = now();

-- Preserve existing Admin-created tier naming where the tier name already communicates
-- the intended item allowance (for example Personal 50 / Personal 150).
update public.subscription_plans
set item_limit = greatest(((regexp_match(display_name, '([0-9]+)[[:space:]]*$'))[1])::integer, 0),
    updated_at = now()
where coalesce(item_limit, 0) = 0
  and display_name ~ '[0-9]+[[:space:]]*$';

-- Add the new limit dimension to existing captured entitlement snapshots without
-- changing their existing document/storage/features values.
update public.tenant_subscriptions s
set entitlements_snapshot =
      (coalesce(s.entitlements_snapshot, '{}'::jsonb) || jsonb_build_object('version', 2))
      || jsonb_build_object(
           'limits',
           coalesce(s.entitlements_snapshot -> 'limits', '{}'::jsonb)
             || jsonb_build_object('itemLimit', greatest(coalesce(p.item_limit, 0), 0))
         ),
    entitlements_snapshot_at = now(),
    updated_at = now()
from public.subscription_plans p
where p.code = s.plan_code;

-- Founder access remains unlimited for vault items.
update public.tenant_subscriptions s
set entitlements_snapshot =
      (coalesce(s.entitlements_snapshot, '{}'::jsonb) || jsonb_build_object('version', 2))
      || jsonb_build_object(
           'limits',
           coalesce(s.entitlements_snapshot -> 'limits', '{}'::jsonb)
             || jsonb_build_object('itemLimit', 0)
         ),
    entitlements_snapshot_at = now(),
    updated_at = now()
from public.tenants t
where t.id = s.tenant_id
  and (
    t.plan_code in ('founder_private', 'private_founder')
    or t.plan_status = 'founder_active'
    or t.tenant_role = 'founder_first_tenant'
  );

grant usage on schema public to service_role;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select, insert, update, delete on public.tenant_subscriptions to service_role;
grant select on public.vault_sync_snapshots to service_role;

commit;
