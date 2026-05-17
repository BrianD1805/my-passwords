import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows } from './_db.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    const tenantId = event.queryStringParameters?.tenantId || '';
    const userId = event.queryStringParameters?.userId || '';
    if (!tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'tenantId and userId are required.' });

    try {
      const rows = await selectRows('vault_sync_snapshots', `select=encrypted_blob,local_salt,local_iv,client_updated_at,created_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc&limit=1`);
      if (!rows.length) return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', hasSnapshot: false, version: APP_VERSION });
      return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', hasSnapshot: true, version: APP_VERSION, snapshot: rows[0] });
    } catch (error) {
      return jsonResponse(500, { ok: false, connected: true, provider: 'supabase', version: APP_VERSION, message: 'Could not load latest encrypted snapshot.', error: error.message, details: error.details || null });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });

  const body = parseBody(event);
  const tenantId = String(body.tenantId || '').trim();
  const userId = String(body.userId || '').trim();
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const itemCount = Number(body.itemCount || 0);
  const clientUpdatedAt = body.clientUpdatedAt ? new Date(body.clientUpdatedAt).toISOString() : new Date().toISOString();

  if (!tenantId || !userId || !encryptedBlob || !localSalt || !localIv) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'tenantId, userId, encryptedBlob, localSalt and localIv are required.' });
  }

  try {
    const snapshotId = publicId('snap');
    await insertRow('vault_sync_snapshots', {
      id: snapshotId,
      tenant_id: tenantId,
      user_id: userId,
      encrypted_blob: encryptedBlob,
      local_salt: localSalt,
      local_iv: localIv,
      item_count: itemCount,
      client_updated_at: clientUpdatedAt
    });
    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: tenantId,
      user_id: userId,
      action: 'encrypted_snapshot_uploaded',
      metadata: { version: APP_VERSION, itemCount, provider: 'supabase' }
    });
    return jsonResponse(200, { ok: true, connected: true, provider: 'supabase', version: APP_VERSION, snapshotId, message: 'Encrypted vault snapshot saved to Supabase.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, connected: true, provider: 'supabase', version: APP_VERSION, message: 'Encrypted sync failed.', error: error.message, details: error.details || null });
  }
}
