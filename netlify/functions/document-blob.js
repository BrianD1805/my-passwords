import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows, upsertRow } from './_db.js';

function safeEq(value) {
  return encodeURIComponent(String(value || ''));
}

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export async function handler(event) {
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ''));
    const tenantId = params.tenantId || '';
    const userId = params.userId || '';
    const documentId = params.documentId || '';
    if (!tenantId || !userId || !documentId) {
      return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'tenantId, userId and documentId are required.' });
    }
    try {
      const rows = await selectRows(
        'document_blobs',
        `select=*&id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=1`
      );
      if (!rows?.length) {
        return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Document file was not found.' });
      }
      return jsonResponse(200, { ok: true, version: APP_VERSION, document: rows[0] });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load the encrypted document file.', error: error.message, details: error.details || null });
    }
  }

  if (!requirePost(event)) {
    return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  }

  const body = parseBody(event);
  const tenantId = String(body.tenantId || '').trim();
  const userId = String(body.userId || '').trim();
  const documentId = String(body.documentId || '').trim();
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const fileName = String(body.fileName || '').trim();
  const fileType = String(body.fileType || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileExtension = String(body.fileExtension || '').trim().toLowerCase();
  const fileSize = toInt(body.fileSize);

  if (!tenantId || !userId || !documentId || !encryptedBlob || !localSalt || !localIv || !fileName) {
    return jsonResponse(400, {
      ok: false,
      version: APP_VERSION,
      message: 'tenantId, userId, documentId, fileName, encryptedBlob, localSalt and localIv are required.'
    });
  }

  try {
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
      metadata: {
        version: APP_VERSION,
        storageMode: 'external_encrypted_document_blob',
        clientUpdatedAt: body.clientUpdatedAt || new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    }, 'id');

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      documentId,
      fileName: saved?.file_name || fileName,
      fileSize: saved?.file_size || fileSize,
      message: 'Encrypted document file stored separately.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      version: APP_VERSION,
      message: 'Encrypted document file could not be stored.',
      error: error.message,
      details: error.details || null
    });
  }
}
