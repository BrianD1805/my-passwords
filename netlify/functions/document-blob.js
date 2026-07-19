import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows, upsertRow } from './_db.js';
import { getActiveCustomerSession } from './_session.js';

function safeEq(value) { return encodeURIComponent(String(value || '')); }
function toInt(value) { const n = Number(value || 0); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0; }

export async function handler(event) {
  let session;
  try {
    session = await getActiveCustomerSession(event);
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not validate the secure account session.', error: error.message });
  }
  if (!session) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'SESSION_REQUIRED', message: 'Verify your account to use encrypted document storage on this device.' });

  const tenantId = session.tenantId;
  const userId = session.userId;

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ''));
    const documentId = params.documentId || '';
    if (!documentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'documentId is required.' });
    try {
      const rows = await selectRows('document_blobs', `select=*&id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=1`);
      if (!rows?.length) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Document file was not found for this account.' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, document: rows[0] });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load the encrypted document file.', error: error.message, details: error.details || null });
    }
  }

  if (!requirePost(event)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const body = parseBody(event);
  const documentId = String(body.documentId || '').trim();
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const fileName = String(body.fileName || '').trim();
  const fileType = String(body.fileType || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileExtension = String(body.fileExtension || '').trim().toLowerCase();
  const fileSize = toInt(body.fileSize);
  if (!documentId || !encryptedBlob || !localSalt || !localIv || !fileName) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'documentId, fileName and encrypted document data are required.' });

  try {
    const existing = await selectRows('document_blobs', `select=id,tenant_id,user_id&id=eq.${safeEq(documentId)}&limit=1`);
    if (existing?.[0] && (existing[0].tenant_id !== tenantId || existing[0].user_id !== userId)) {
      return jsonResponse(403, { ok: false, version: APP_VERSION, message: 'This document identifier belongs to another account.' });
    }
    const saved = await upsertRow('document_blobs', {
      id: documentId,
      tenant_id: tenantId,
      user_id: userId,
      file_name: fileName,
      file_type: fileType,
      file_extension: fileExtension,
      file_size: fileSize,
      encrypted_blob: encryptedBlob,
      local_salt: localSalt,
      local_iv: localIv,
      metadata: { version: APP_VERSION, storageMode: 'external_encrypted_document_blob', tenant_identity_source: 'secure_session', clientUpdatedAt: body.clientUpdatedAt || new Date().toISOString() },
      updated_at: new Date().toISOString()
    }, 'id');
    return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, fileName: saved?.file_name || fileName, fileSize: saved?.file_size || fileSize, message: 'Encrypted document file stored for the authenticated account.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Encrypted document file could not be stored.', error: error.message, details: error.details || null });
  }
}
