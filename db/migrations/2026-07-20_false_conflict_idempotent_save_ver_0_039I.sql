-- My Passwords Ver-0.039I
-- Prevent false self-conflicts when the same encrypted device copy is submitted twice.
-- Safe function update only. It does not alter or delete vault snapshots or vault data.

begin;

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

    -- A duplicate request from the same device can arrive immediately after the
    -- first save. If the encrypted envelope is identical, link to the existing
    -- backup instead of reporting a two-device conflict.
    if coalesce(v_latest.encrypted_blob, '') = coalesce(p_encrypted_blob, '')
       and coalesce(v_latest.local_salt, '') = coalesce(p_local_salt, '')
       and coalesce(v_latest.local_iv, '') = coalesce(p_local_iv, '') then
      return jsonb_build_object(
        'ok', true,
        'conflict', false,
        'snapshotId', v_latest.id,
        'reusedExistingBackup', true
      );
    end if;

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
    'snapshotId', p_id,
    'reusedExistingBackup', false
  );
end;
$$;

grant execute on function public.save_vault_snapshot_if_current(
  text, text, text, text, text, text, integer, timestamptz, text, text, text, boolean
) to service_role;

commit;
