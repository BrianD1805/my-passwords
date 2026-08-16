-- Password-Encrypt Ver-1.008
-- Encrypted picture uploads, picture plan limits and chunked encrypted file transport.
-- Safe additive migration. Existing encrypted documents and Emergency Access files remain intact.
-- Zero plan limits mean unlimited. Every individual document or picture remains capped at 10 MB by the app/server.

begin;

alter table public.subscription_plans
  add column if not exists photo_limit integer not null default 0;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_photo_limit_nonnegative;

alter table public.subscription_plans
  add constraint subscription_plans_photo_limit_nonnegative
  check (photo_limit >= 0);

alter table public.document_blobs
  add column if not exists blob_kind text not null default 'document';

update public.document_blobs
set blob_kind = 'document'
where blob_kind is null
   or blob_kind not in ('document', 'picture');

alter table public.document_blobs
  drop constraint if exists document_blobs_blob_kind_check;

alter table public.document_blobs
  add constraint document_blobs_blob_kind_check
  check (blob_kind in ('document', 'picture'));

create index if not exists idx_document_blobs_tenant_kind_updated
  on public.document_blobs(tenant_id, blob_kind, updated_at desc);

create table if not exists public.document_blob_chunks (
  id text primary key,
  blob_id text not null references public.document_blobs(id) on delete cascade,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_data text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blob_id, chunk_index)
);

alter table public.document_blob_chunks enable row level security;

create index if not exists idx_document_blob_chunks_blob_index
  on public.document_blob_chunks(blob_id, chunk_index);

create index if not exists idx_document_blob_chunks_tenant_user
  on public.document_blob_chunks(tenant_id, user_id, blob_id);

create table if not exists public.emergency_access_document_chunks (
  id text primary key,
  document_id text not null references public.emergency_access_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_data text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

alter table public.emergency_access_document_chunks enable row level security;

create index if not exists idx_emergency_access_document_chunks_document
  on public.emergency_access_document_chunks(document_id, chunk_index);

-- Existing plans inherit their current Document limit as the initial Picture limit once.
-- Admin can then adjust the two limits independently.
update public.subscription_plans
set
  photo_limit = greatest(coalesce(document_limit, 0), 0),
  feature_flags = coalesce(feature_flags, '{}'::jsonb) || jsonb_build_object('pictures', true),
  entitlement_version = 3,
  updated_at = now()
where coalesce(entitlement_version, 1) < 3;

update public.tenant_subscriptions s
set
  entitlements_snapshot =
    (coalesce(s.entitlements_snapshot, '{}'::jsonb) || jsonb_build_object('version', 3))
    || jsonb_build_object(
         'limits',
         coalesce(s.entitlements_snapshot -> 'limits', '{}'::jsonb)
           || jsonb_build_object('photoLimit', greatest(coalesce(p.photo_limit, 0), 0))
       )
    || jsonb_build_object(
         'features',
         coalesce(s.entitlements_snapshot -> 'features', '{}'::jsonb)
           || jsonb_build_object('pictures', true)
       ),
  entitlements_snapshot_at = now(),
  updated_at = now()
from public.subscription_plans p
where p.code = s.plan_code
  and coalesce((s.entitlements_snapshot ->> 'version')::integer, 0) < 3;

update public.tenant_subscriptions s
set
  entitlements_snapshot =
    (coalesce(s.entitlements_snapshot, '{}'::jsonb) || jsonb_build_object('version', 3))
    || jsonb_build_object(
         'limits',
         coalesce(s.entitlements_snapshot -> 'limits', '{}'::jsonb)
           || jsonb_build_object('photoLimit', 0)
       )
    || jsonb_build_object(
         'features',
         coalesce(s.entitlements_snapshot -> 'features', '{}'::jsonb)
           || jsonb_build_object('pictures', true)
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
grant select, insert, update, delete on public.document_blobs to service_role;
grant select, insert, update, delete on public.document_blob_chunks to service_role;
grant select, insert, update, delete on public.emergency_access_document_chunks to service_role;

revoke all on public.document_blob_chunks from anon, authenticated;
revoke all on public.emergency_access_document_chunks from anon, authenticated;

commit;
