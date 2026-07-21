import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, supabaseRequest } from './_db.js';
import { getCustomerAccess } from './_session.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

async function recordSyncEvent({ tenantId, userId, eventType, status = 'info', itemCount = 0, message = '', deviceId = '', metadata = {} }) {
  return insertRow('vault_sync_events', {
    id: publicId('sync_event'),
    tenant_id: tenantId,
    user_id: userId,
    event_type: String(eventType || 'sync_event').slice(0, 80),
    status: String(status || 'info').slice(0, 30),
    item_count: Number(itemCount || 0),
    message: String(message || '').slice(0, 500),
    device_id: String(deviceId || '').slice(0, 120),
    metadata: { version: APP_VERSION, ...metadata }
  }).catch(() => null);
}

export async function handler(event) {
  let access;
  try {
    access = await getCustomerAccess(event);
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not check account access.', error: error.message });
  }
  if (!access.ok) {
    const statusCode = access.code === 'SESSION_REQUIRED' ? 401 : 403;
    return jsonResponse(statusCode, { ok: false, version: APP_VERSION, code: access.code, message: access.message });
  }

  const tenantId = access.session.tenantId;
  const userId = access.session.userId;

  if (event.httpMethod === 'GET') {
    try {
      const wantsHistory = event.queryStringParameters?.history === '1' || event.queryStringParameters?.history === 'true';
      if (wantsHistory) {
        const snapshots = await selectRows('vault_sync_snapshots', `select=id,item_count,client_updated_at,created_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc&limit=5`);
        const countRows = await selectRows('vault_sync_snapshots', `select=id&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&limit=1000`);
        return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', hasSnapshot: snapshots.length > 0, version: APP_VERSION, snapshotCount: countRows.length, snapshots, latest: snapshots[0] || null, message: snapshots.length ? 'Encrypted Supabase snapshot history loaded.' : 'No encrypted Supabase snapshots found yet.' });
      }
      const rows = await selectRows('vault_sync_snapshots', `select=id,item_count,encrypted_blob,local_salt,local_iv,client_updated_at,created_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc&limit=1`);
      if (!rows.length) return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', hasSnapshot: false, version: APP_VERSION, snapshotCount: 0 });
      return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', hasSnapshot: true, version: APP_VERSION, snapshot: rows[0], snapshotCount: 1, message: 'Latest cloud backup found for the authenticated account.' });
    } catch (error) {
      return jsonResponse(500, { ok: false, connected: true, provider: 'supabase', version: APP_VERSION, message: 'Could not load the latest cloud backup.', error: error.message, details: error.details || null });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const body = parseBody(event);
  if (String(body.action || '') === 'record_event') {
    await recordSyncEvent({ tenantId, userId, eventType: body.eventType, status: body.status, itemCount: body.itemCount, message: body.message, deviceId: body.deviceId, metadata: body.metadata || {} });
    return jsonResponse(200, { ok: true, version: APP_VERSION, message: 'Sync diagnostic recorded.' });
  }
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const itemCount = Number(body.itemCount || 0);
  const clientUpdatedAt = body.clientUpdatedAt ? new Date(body.clientUpdatedAt).toISOString() : new Date().toISOString();
  if (!encryptedBlob || !localSalt || !localIv) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Encrypted vault data, salt and IV are required.' });

  try {
    const snapshotId = publicId('snap');
    const rpcResult = await supabaseRequest('rpc/save_vault_snapshot_if_current', {
      method: 'POST',
      body: JSON.stringify({
        p_id: snapshotId,
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_encrypted_blob: encryptedBlob,
        p_local_salt: localSalt,
        p_local_iv: localIv,
        p_item_count: itemCount,
        p_client_updated_at: clientUpdatedAt,
        p_base_snapshot_id: String(body.baseSnapshotId || ''),
        p_device_id: String(body.deviceId || ''),
        p_device_type: String(body.deviceType || ''),
        p_force: Boolean(body.explicitConflictChoice)
      })
    });
    const saved = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
    if (!saved?.ok && saved?.conflict) {
      await recordSyncEvent({
        tenantId,
        userId,
        eventType: 'backup_conflict_blocked',
        status: 'warning',
        itemCount,
        message: 'A stale device backup was blocked before it could replace the latest cloud copy.',
        deviceId: body.deviceId,
        metadata: { deviceType: body.deviceType || '', latestSnapshotId: saved.latestSnapshotId || '', baseSnapshotId: body.baseSnapshotId || '' }
      });
      return jsonResponse(409, {
        ok: false,
        connected: true,
        provider: 'supabase',
        version: APP_VERSION,
        code: 'VAULT_CONFLICT',
        message: 'Different vault changes were found. Nothing was replaced.',
        latest: {
          id: saved.latestSnapshotId || '',
          item_count: Number(saved.latestItemCount || 0),
          client_updated_at: saved.latestClientUpdatedAt || null,
          created_at: saved.latestCreatedAt || null
        }
      });
    }
    if (!saved?.ok) throw new Error(saved?.message || 'Secure backup could not be saved.');

    const effectiveSnapshotId = saved.snapshotId || snapshotId;
    const reusedExistingBackup = Boolean(saved.reusedExistingBackup || saved.reused);
    await insertRow('audit_log', { id: publicId('audit'), tenant_id: tenantId, user_id: userId, action: reusedExistingBackup ? 'encrypted_snapshot_reused' : 'encrypted_snapshot_uploaded', metadata: { version: APP_VERSION, itemCount, provider: 'supabase', tenant_identity_source: 'secure_session', base_snapshot_id: body.baseSnapshotId || '', snapshot_id: effectiveSnapshotId, reused_existing_backup: reusedExistingBackup, forced_conflict_choice: Boolean(body.explicitConflictChoice) } });
    await recordSyncEvent({ tenantId, userId, eventType: reusedExistingBackup ? 'backup_duplicate_reused' : 'backup_success', status: 'success', itemCount, message: reusedExistingBackup ? 'Matching encrypted vault backup already existed and was reused.' : 'Encrypted vault backup saved.', deviceId: body.deviceId, metadata: { deviceType: body.deviceType || '', snapshotId: effectiveSnapshotId, baseSnapshotId: body.baseSnapshotId || '', reusedExistingBackup, forcedConflictChoice: Boolean(body.explicitConflictChoice) } });
    return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', version: APP_VERSION, snapshotId: effectiveSnapshotId, reusedExistingBackup, itemCount, clientUpdatedAt, message: reusedExistingBackup ? 'Matching secure backup already exists and is now linked to this device.' : 'Cloud backup saved for the authenticated account.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, connected: true, provider: 'supabase', version: APP_VERSION, message: 'Cloud backup failed.', error: error.message, details: error.details || null });
  }
}
