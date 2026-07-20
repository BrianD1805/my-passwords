-- My Passwords Ver-0.039H
-- Vault Sync Safety operational event log and atomic stale-device protection.
-- Additive only: does not alter or delete encrypted vault snapshots, documents,
-- tenants, users, subscriptions or Emergency Access data.

begin;

alter table public.vault_sync_snapshots
  add column if not exists base_snapshot_id text,
  add column if not exists device_id text,
  add column if not exists device_type text;

create table if not exists public.vault_sync_events (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text references public.users(id) on delete set null,
  event_type text not null,
  status text not null default 'info',
  item_count integer not null default 0 check (item_count >= 0),
  message text not null default '',
  device_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vault_sync_events_tenant_created
  on public.vault_sync_events(tenant_id, created_at desc);

create index if not exists idx_vault_sync_events_status_created
  on public.vault_sync_events(status, created_at desc);

create index if not exists idx_vault_sync_events_event_type
  on public.vault_sync_events(event_type, created_at desc);

create index if not exists idx_vault_sync_snapshots_tenant_user_created
  on public.vault_sync_snapshots(tenant_id, user_id, created_at desc);

create or replace function public.save_vault_snapshot_if_current(
  p_id text,
  p_tenant_id text,
  p_user_id text,
  p_encrypted_blob text,
  p_local_salt text,
  p_local_iv text,
  p_item_count integer,
  p_client_updated_at timestamptz,
  p_base_snapshot_id text,
  p_device_id text,
  p_device_type text,
  p_force boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_latest public.vault_sync_snapshots%rowtype;
begin
  -- Serialise saves for this exact tenant/user pair so two devices cannot both
  -- pass the freshness check at the same time.
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(p_tenant_id, '') || ':' || coalesce(p_user_id, ''), 0)
  );

  select *
  into v_latest
  from public.vault_sync_snapshots
  where tenant_id = p_tenant_id
    and user_id = p_user_id
  order by created_at desc, id desc
  limit 1;

  if found
     and not coalesce(p_force, false)
     and coalesce(p_base_snapshot_id, '') <> coalesce(v_latest.id, '') then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'message', 'Different vault changes were found. Nothing was replaced.',
      'latestSnapshotId', v_latest.id,
      'latestItemCount', v_latest.item_count,
      'latestClientUpdatedAt', v_latest.client_updated_at,
      'latestCreatedAt', v_latest.created_at
    );
  end if;

  insert into public.vault_sync_snapshots (
    id,
    tenant_id,
    user_id,
    encrypted_blob,
    local_salt,
    local_iv,
    item_count,
    client_updated_at,
    base_snapshot_id,
    device_id,
    device_type
  ) values (
    p_id,
    p_tenant_id,
    p_user_id,
    p_encrypted_blob,
    p_local_salt,
    p_local_iv,
    greatest(coalesce(p_item_count, 0), 0),
    p_client_updated_at,
    nullif(p_base_snapshot_id, ''),
    nullif(p_device_id, ''),
    nullif(p_device_type, '')
  );

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'snapshotId', p_id
  );
end;
$$;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.vault_sync_events to service_role;
grant select, insert, update, delete on public.vault_sync_snapshots to service_role;
grant execute on function public.save_vault_snapshot_if_current(
  text, text, text, text, text, text, integer, timestamptz, text, text, text, boolean
) to service_role;

commit;
