import { APP_VERSION, getSql, jsonResponse, parseBody, publicId } from './_db.js';

export async function handler(event) {
  const sql = getSql();
  if (!sql) {
    return jsonResponse(200, {
      ok: false,
      connected: false,
      version: APP_VERSION,
      message: 'Database is not configured yet. Local encrypted vault remains available.'
    });
  }

  if (event.httpMethod === 'GET') {
    const tenantId = event.queryStringParameters?.tenantId || '';
    const userId = event.queryStringParameters?.userId || '';
    if (!tenantId || !userId) return jsonResponse(400, { ok: false, message: 'tenantId and userId are required.' });

    try {
      const rows = await sql`select encrypted_blob, local_salt, local_iv, client_updated_at, created_at
        from vault_sync_snapshots
        where tenant_id = ${tenantId} and user_id = ${userId}
        order by created_at desc limit 1`;
      if (!rows.length) return jsonResponse(200, { ok: true, connected: true, hasSnapshot: false, version: APP_VERSION });
      return jsonResponse(200, { ok: true, connected: true, hasSnapshot: true, version: APP_VERSION, snapshot: rows[0] });
    } catch (error) {
      return jsonResponse(500, { ok: false, connected: true, message: 'Could not load latest encrypted snapshot.', error: error.message });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, message: 'GET or POST required.' });

  const body = parseBody(event);
  const tenantId = String(body.tenantId || '').trim();
  const userId = String(body.userId || '').trim();
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const itemCount = Number(body.itemCount || 0);
  const clientUpdatedAt = body.clientUpdatedAt ? new Date(body.clientUpdatedAt).toISOString() : new Date().toISOString();

  if (!tenantId || !userId || !encryptedBlob || !localSalt || !localIv) {
    return jsonResponse(400, { ok: false, message: 'tenantId, userId, encryptedBlob, localSalt and localIv are required.' });
  }

  try {
    const snapshotId = publicId('snap');
    await sql`insert into vault_sync_snapshots (id, tenant_id, user_id, encrypted_blob, local_salt, local_iv, item_count, client_updated_at)
      values (${snapshotId}, ${tenantId}, ${userId}, ${encryptedBlob}, ${localSalt}, ${localIv}, ${itemCount}, ${clientUpdatedAt})`;
    await sql`insert into audit_log (id, tenant_id, user_id, action, metadata)
      values (${publicId('audit')}, ${tenantId}, ${userId}, 'encrypted_snapshot_uploaded', ${JSON.stringify({ version: APP_VERSION, itemCount })}::jsonb)`;
    return jsonResponse(200, { ok: true, connected: true, version: APP_VERSION, snapshotId, message: 'Encrypted vault snapshot saved to database.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, connected: true, message: 'Encrypted sync failed.', error: error.message });
  }
}
