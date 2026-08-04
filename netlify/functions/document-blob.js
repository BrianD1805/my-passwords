import { APP_VERSION, deleteRow, jsonResponse, parseBody, requirePost, selectRows, upsertRow } from './_db.js';
import { getCustomerAccess } from './_session.js';
import { limitReached, serialiseEntitlements } from './_entitlements.js';

function safeEq(value) { return encodeURIComponent(String(value || '')); }
function toInt(value) { const n = Number(value || 0); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0; }
function base64ByteLength(value) {
  const clean = String(value || '').replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
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

  if (event.httpMethod === 'DELETE') {
    const params = event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ''));
    const documentId = String(params.documentId || '').trim();
    if (!documentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'documentId is required.' });
    try {
      const rows = await selectRows('document_blobs', `select=id,tenant_id,user_id,file_size,storage_bytes&id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=1`);
      const existing = rows?.[0] || null;
      if (!existing?.id) {
        return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, alreadyRemoved: true, entitlements: access.entitlementContext?.serialized || access.entitlements || null, message: 'Encrypted document storage was already clear.' });
      }
      await deleteRow('document_blobs', `id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}`);
      const currentUsage = access.entitlementContext?.usage || { users: 0, documents: 0, storageBytes: 0 };
      const removedBytes = Number(existing.storage_bytes || existing.file_size || 0);
      const updatedUsage = {
        ...currentUsage,
        documents: Math.max(0, Number(currentUsage.documents || 0) - 1),
        storageBytes: Math.max(0, Number(currentUsage.storageBytes || 0) - removedBytes)
      };
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        documentId,
        removedBytes,
        entitlements: serialiseEntitlements(access.entitlementContext?.effective || {}, updatedUsage),
        message: 'Encrypted document storage removed for this account.'
      });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Encrypted document storage could not be removed.', error: error.message, details: error.details || null });
    }
  }

  if (!requirePost(event)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET, POST or DELETE required.' });
  const body = parseBody(event);
  const documentId = String(body.documentId || '').trim();
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const fileName = String(body.fileName || '').trim();
  const fileType = String(body.fileType || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileExtension = String(body.fileExtension || '').trim().toLowerCase();
  const fileSize = toInt(body.fileSize);
  const storageBytes = Math.max(fileSize, base64ByteLength(encryptedBlob));
  if (!documentId || !encryptedBlob || !localSalt || !localIv || !fileName) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'documentId, fileName and encrypted document data are required.' });
  if (fileSize > 10 * 1024 * 1024) return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'DOCUMENT_TOO_LARGE', message: 'Documents larger than 10 MB are not supported.' });

  try {
    const entitlementContext = access.entitlementContext;
    const entitlements = entitlementContext?.effective || {};
    const serializedEntitlements = entitlementContext?.serialized || serialiseEntitlements(entitlements, entitlementContext?.usage || {});
    if (entitlements?.features?.documents === false) {
      return jsonResponse(403, {
        ok: false,
        version: APP_VERSION,
        code: 'PLAN_FEATURE_REQUIRED',
        feature: 'documents',
        upgradeRequired: true,
        entitlements: serializedEntitlements,
        message: 'Encrypted document storage is not included in this plan.'
      });
    }

    const existing = await selectRows('document_blobs', `select=id,tenant_id,user_id,file_size,storage_bytes&id=eq.${safeEq(documentId)}&limit=1`);
    if (existing?.[0] && (existing[0].tenant_id !== tenantId || existing[0].user_id !== userId)) {
      return jsonResponse(403, { ok: false, version: APP_VERSION, message: 'This document identifier belongs to another account.' });
    }

    const currentUsage = entitlementContext?.usage || { documents: 0, storageBytes: 0 };
    const isNewDocument = !existing?.[0];
    const documentLimit = Number(entitlements?.limits?.documentLimit || 0);
    const storageLimitMb = Number(entitlements?.limits?.storageLimitMb || 0);
    const existingSize = Number(existing?.[0]?.storage_bytes || existing?.[0]?.file_size || 0);
    const storageDelta = Math.max(0, storageBytes - existingSize);
    if (isNewDocument && limitReached(documentLimit, currentUsage.documents, 1)) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'DOCUMENT_LIMIT_REACHED',
        feature: 'documents',
        upgradeRequired: true,
        entitlements: serializedEntitlements,
        usage: currentUsage,
        message: `This plan has reached its ${documentLimit}-document limit. Upgrade the plan or remove an existing document before adding another.`
      });
    }
    if (storageLimitMb > 0 && limitReached(storageLimitMb * 1024 * 1024, currentUsage.storageBytes, storageDelta)) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'STORAGE_LIMIT_REACHED',
        feature: 'documents',
        upgradeRequired: true,
        entitlements: serializedEntitlements,
        usage: currentUsage,
        message: `This plan has reached its ${storageLimitMb} MB encrypted-document storage limit. Upgrade the plan or remove an existing document before uploading another.`
      });
    }

    const saved = await upsertRow('document_blobs', {
      id: documentId,
      tenant_id: tenantId,
      user_id: userId,
      file_name: fileName,
      file_type: fileType,
      file_extension: fileExtension,
      file_size: fileSize,
      storage_bytes: storageBytes,
      encrypted_blob: encryptedBlob,
      local_salt: localSalt,
      local_iv: localIv,
      metadata: { version: APP_VERSION, storageMode: 'external_encrypted_document_blob', tenant_identity_source: 'secure_session', clientUpdatedAt: body.clientUpdatedAt || new Date().toISOString() },
      updated_at: new Date().toISOString()
    }, 'id');
    return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, fileName: saved?.file_name || fileName, fileSize: saved?.file_size || fileSize, storageBytes: saved?.storage_bytes || storageBytes, entitlements: serialiseEntitlements(entitlements, { ...currentUsage, documents: currentUsage.documents + (isNewDocument ? 1 : 0), storageBytes: currentUsage.storageBytes - existingSize + storageBytes }), message: 'Encrypted document file stored for the authenticated account.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Encrypted document file could not be stored.', error: error.message, details: error.details || null });
  }
}
