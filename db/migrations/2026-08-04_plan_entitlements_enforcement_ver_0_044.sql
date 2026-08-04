-- My Passwords Ver-0.044
-- Plan Features and Entitlement Enforcement.
-- Safe additive migration. It does not delete or rewrite encrypted vault
-- snapshots, encrypted document contents, Emergency Access data, tenants or users.

begin;

alter table public.subscription_plans
  add column if not exists feature_flags jsonb not null default '{}'::jsonb,
  add column if not exists entitlement_version integer not null default 1;

alter table public.document_blobs
  add column if not exists storage_bytes bigint not null default 0;

update public.document_blobs
set storage_bytes = greatest(
  coalesce(file_size, 0)::bigint,
  greatest(
    0,
    ((length(coalesce(encrypted_blob, ''))::bigint * 3) / 4)
      - case
          when right(coalesce(encrypted_blob, ''), 2) = '==' then 2
          when right(coalesce(encrypted_blob, ''), 1) = '=' then 1
          else 0
        end
  )
)
where coalesce(storage_bytes, 0) = 0;

alter table public.document_blobs
  drop constraint if exists document_blobs_storage_bytes_nonnegative;

alter table public.document_blobs
  add constraint document_blobs_storage_bytes_nonnegative
  check (storage_bytes >= 0);

alter table public.tenant_subscriptions
  add column if not exists entitlements_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists entitlements_snapshot_at timestamptz,
  add column if not exists entitlement_overrides jsonb not null default '{}'::jsonb,
  add column if not exists entitlement_override_note text not null default '',
  add column if not exists entitlement_override_updated_at timestamptz,
  add column if not exists entitlement_override_updated_by text;

-- Existing plans retain the capabilities that were already present before
-- enforcement. New structured flags can then be edited safely in Admin.
update public.subscription_plans
set
  feature_flags = jsonb_build_object(
    'documents', true,
    'emergencyAccess', true,
    'secureDeviceUnlock', true,
    'cloudBackupSync', true,
    'multiUser', false,
    'sharing', false
  ) || coalesce(feature_flags, '{}'::jsonb),
  entitlement_version = greatest(coalesce(entitlement_version, 1), 1),
  updated_at = now();

-- Personal is the only launch-ready commercial plan. Family and Business
-- stay hidden until household/team membership and sharing are actually built.
update public.subscription_plans
set
  is_public = false,
  is_featured = false,
  description = case
    when code = 'family' then 'Household functionality is not available yet.'
    when code = 'business' then 'Team functionality is not available yet.'
    else description
  end,
  features = case when code in ('family', 'business') then '[]'::jsonb else features end,
  feature_flags = case
    when code in ('family', 'business') then jsonb_build_object(
      'documents', true,
      'emergencyAccess', true,
      'secureDeviceUnlock', true,
      'cloudBackupSync', true,
      'multiUser', false,
      'sharing', false
    )
    else feature_flags
  end,
  updated_at = now()
where code in ('family', 'business');

-- Capture the purchased/trial plan entitlements once. Later edits to the plan
-- catalogue do not silently remove features from existing customers.
update public.tenant_subscriptions s
set
  entitlements_snapshot = jsonb_build_object(
    'version', 1,
    'planCode', p.code,
    'planName', p.display_name,
    'capturedAt', now(),
    'limits', jsonb_build_object(
      'maxUsers', greatest(coalesce(p.max_users, 1), 1),
      'documentLimit', greatest(coalesce(p.document_limit, 0), 0),
      'storageLimitMb', greatest(coalesce(p.storage_limit_mb, 0), 0)
    ),
    'features', jsonb_build_object(
      'documents', coalesce((p.feature_flags ->> 'documents')::boolean, true),
      'emergencyAccess', coalesce((p.feature_flags ->> 'emergencyAccess')::boolean, true),
      'secureDeviceUnlock', coalesce((p.feature_flags ->> 'secureDeviceUnlock')::boolean, true),
      'cloudBackupSync', coalesce((p.feature_flags ->> 'cloudBackupSync')::boolean, true),
      'multiUser', coalesce((p.feature_flags ->> 'multiUser')::boolean, false),
      'sharing', coalesce((p.feature_flags ->> 'sharing')::boolean, false)
    )
  ),
  entitlements_snapshot_at = coalesce(s.entitlements_snapshot_at, now()),
  entitlement_overrides = coalesce(s.entitlement_overrides, '{}'::jsonb),
  updated_at = now()
from public.subscription_plans p
where p.code = s.plan_code
  and (s.entitlements_snapshot is null or s.entitlements_snapshot = '{}'::jsonb);

-- Founder access remains permanent and keeps the existing personal-vault
-- capabilities without introducing unbuilt household/team promises.
update public.tenant_subscriptions s
set
  entitlements_snapshot = jsonb_build_object(
    'version', 1,
    'planCode', 'founder_private',
    'planName', 'Founder Plan',
    'capturedAt', now(),
    'limits', jsonb_build_object('maxUsers', 1, 'documentLimit', 0, 'storageLimitMb', 0),
    'features', jsonb_build_object(
      'documents', true,
      'emergencyAccess', true,
      'secureDeviceUnlock', true,
      'cloudBackupSync', true,
      'multiUser', false,
      'sharing', false
    )
  ),
  entitlements_snapshot_at = coalesce(s.entitlements_snapshot_at, now()),
  entitlement_overrides = coalesce(s.entitlement_overrides, '{}'::jsonb),
  updated_at = now()
from public.tenants t
where t.id = s.tenant_id
  and (
    t.plan_code in ('founder_private', 'private_founder')
    or t.plan_status = 'founder_active'
    or t.tenant_role = 'founder_first_tenant'
  )
  and (s.entitlements_snapshot is null or s.entitlements_snapshot = '{}'::jsonb);

create index if not exists idx_subscription_plans_feature_flags
  on public.subscription_plans using gin(feature_flags);

create index if not exists idx_tenant_subscriptions_entitlement_snapshot
  on public.tenant_subscriptions using gin(entitlements_snapshot);

create index if not exists idx_tenant_subscriptions_entitlement_overrides
  on public.tenant_subscriptions using gin(entitlement_overrides);

grant usage on schema public to service_role;
grant select, insert, update, delete on public.subscription_plans to service_role;
grant select, insert, update, delete on public.tenant_subscriptions to service_role;
grant select, insert, update, delete on public.document_blobs to service_role;
grant select, insert, update, delete on public.users to service_role;
grant select, insert, update, delete on public.tenants to service_role;
grant select, insert, update, delete on public.audit_log to service_role;
grant select, insert, update, delete on public.billing_events to service_role;

commit;
