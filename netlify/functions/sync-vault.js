import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows } from './_db.js';
import { getActiveCustomerSession } from './_session.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  let session;
  try {
    session = await getActiveCustomerSession(event);
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not validate the secure account session.', error: error.message });
  }
  if (!session) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'SESSION_REQUIRED', message: 'Verify your account to use encrypted cloud backup on this device.' });

  const tenantId = session.tenantId;
  const userId = session.userId;

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
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const itemCount = Number(body.itemCount || 0);
  const clientUpdatedAt = body.clientUpdatedAt ? new Date(body.clientUpdatedAt).toISOString() : new Date().toISOString();
  if (!encryptedBlob || !localSalt || !localIv) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Encrypted vault data, salt and IV are required.' });

  try {
    const snapshotId = publicId('snap');
    await insertRow('vault_sync_snapshots', { id: snapshotId, tenant_id: tenantId, user_id: userId, encrypted_blob: encryptedBlob, local_salt: localSalt, local_iv: localIv, item_count: itemCount, client_updated_at: clientUpdatedAt });
    await insertRow('audit_log', { id: publicId('audit'), tenant_id: tenantId, user_id: userId, action: 'encrypted_snapshot_uploaded', metadata: { version: APP_VERSION, itemCount, provider: 'supabase', tenant_identity_source: 'secure_session' } });
    return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', version: APP_VERSION, snapshotId, itemCount, clientUpdatedAt, message: 'Cloud backup saved for the authenticated account.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, connected: true, provider: 'supabase', version: APP_VERSION, message: 'Cloud backup failed.', error: error.message, details: error.details || null });
  }
}
