import { APP_VERSION, deleteRow, jsonResponse, parseBody, requirePost, selectRows, updateRow, upsertRow } from './_db.js';
import { getCustomerAccess } from './_session.js';
import { limitReached, serialiseEntitlements } from './_entitlements.js';
import { assertBrowserAction } from './_security.js';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_CHUNK_CHARACTERS = 2_500_000;
const MAX_CHUNKS = 32;
const MAX_ENCRYPTED_BLOB_CHARACTERS = 20_000_000;
const CHUNKED_SENTINEL = '__chunked_encrypted_file_v1__';
const ALLOWED_PICTURE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);
const ALLOWED_PICTURE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function safeEq(value) { return encodeURIComponent(String(value || '')); }
function toInt(value) { const n = Number(value || 0); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0; }
function normaliseBlobKind(value) { return String(value || '').trim().toLowerCase() === 'picture' ? 'picture' : 'document'; }
function base64ByteLength(value) {
  const clean = String(value || '').replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}
function chunkedMetadata(metadata = {}) { return String(metadata?.storageMode || '') === 'chunked_encrypted_file_v1'; }
function usageAfterRemoval(currentUsage = {}, existing = {}) {
  const removedBytes = Number(existing.storage_bytes || existing.file_size || 0);
  const kind = normaliseBlobKind(existing.blob_kind);
  return {
    ...currentUsage,
    documents: Math.max(0, Number(currentUsage.documents || 0) - (kind === 'document' ? 1 : 0)),
    pictures: Math.max(0, Number(currentUsage.pictures || 0) - (kind === 'picture' ? 1 : 0)),
    documentStorageBytes: Math.max(0, Number(currentUsage.documentStorageBytes || 0) - (kind === 'document' ? removedBytes : 0)),
    pictureStorageBytes: Math.max(0, Number(currentUsage.pictureStorageBytes || 0) - (kind === 'picture' ? removedBytes : 0)),
    storageBytes: Math.max(0, Number(currentUsage.storageBytes || 0) - removedBytes)
  };
}
function entitlementDecision(access, existingRow, { blobKind, storageBytes }) {
  const entitlementContext = access.entitlementContext;
  const entitlements = entitlementContext?.effective || {};
  const serializedEntitlements = entitlementContext?.serialized || serialiseEntitlements(entitlements, entitlementContext?.usage || {});
  const requiredFeature = blobKind === 'picture' ? 'pictures' : 'documents';
  const kindLabel = blobKind === 'picture' ? 'picture' : 'document';
  if (entitlements?.features?.[requiredFeature] === false) return { error: jsonResponse(403, { ok: false, version: APP_VERSION, code: 'PLAN_FEATURE_REQUIRED', feature: requiredFeature, upgradeRequired: true, entitlements: serializedEntitlements, message: `Encrypted ${kindLabel} storage is not included in this plan.` }) };
  const existingKind = existingRow ? normaliseBlobKind(existingRow.blob_kind) : '';
  const isNew = !existingRow;
  const kindChanged = Boolean(existingRow && existingKind !== blobKind);
  const currentUsage = entitlementContext?.usage || { documents: 0, pictures: 0, storageBytes: 0 };
  const usageKey = blobKind === 'picture' ? 'pictures' : 'documents';
  const limitKey = blobKind === 'picture' ? 'photoLimit' : 'documentLimit';
  const kindLimit = Number(entitlements?.limits?.[limitKey] || 0);
  const storageLimitMb = Number(entitlements?.limits?.storageLimitMb || 0);
  const existingSize = Number(existingRow?.storage_bytes || existingRow?.file_size || 0);
  const storageDelta = Math.max(0, storageBytes - existingSize);
  const requestedCount = isNew || kindChanged ? 1 : 0;
  if (requestedCount && limitReached(kindLimit, currentUsage[usageKey], 1)) return { error: jsonResponse(409, { ok: false, version: APP_VERSION, code: blobKind === 'picture' ? 'PHOTO_LIMIT_REACHED' : 'DOCUMENT_LIMIT_REACHED', feature: requiredFeature, upgradeRequired: true, entitlements: serializedEntitlements, usage: currentUsage, message: `This plan has reached its ${kindLimit}-${kindLabel} limit. Remove an existing ${kindLabel} or review the plan before adding another.` }) };
  if (storageLimitMb > 0 && limitReached(storageLimitMb * 1024 * 1024, currentUsage.storageBytes, storageDelta)) return { error: jsonResponse(409, { ok: false, version: APP_VERSION, code: 'STORAGE_LIMIT_REACHED', feature: 'storage', upgradeRequired: true, entitlements: serializedEntitlements, usage: currentUsage, message: `This plan has reached its ${storageLimitMb} MB total account storage limit. The allowance includes the encrypted cloud vault, documents and pictures.` }) };
  const updatedUsage = { ...currentUsage };
  if (kindChanged) updatedUsage[existingKind === 'picture' ? 'pictures' : 'documents'] = Math.max(0, Number(updatedUsage[existingKind === 'picture' ? 'pictures' : 'documents'] || 0) - 1);
  if (isNew || kindChanged) updatedUsage[usageKey] = Number(updatedUsage[usageKey] || 0) + 1;
  updatedUsage.documentStorageBytes = Math.max(0, Number(currentUsage.documentStorageBytes || 0) - (existingKind === 'document' ? existingSize : 0) + (blobKind === 'document' ? storageBytes : 0));
  updatedUsage.pictureStorageBytes = Math.max(0, Number(currentUsage.pictureStorageBytes || 0) - (existingKind === 'picture' ? existingSize : 0) + (blobKind === 'picture' ? storageBytes : 0));
  updatedUsage.storageBytes = Math.max(0, Number(currentUsage.storageBytes || 0) - existingSize + storageBytes);
  return { serialized: serialiseEntitlements(entitlements, updatedUsage) };
}

export async function handler(event) {
  let access;
  try { access = await getCustomerAccess(event); }
  catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not check account access.', error: error.message }); }
  if (!access.ok) return jsonResponse(access.code === 'SESSION_REQUIRED' ? 401 : 403, { ok: false, version: APP_VERSION, code: access.code, message: access.message });
  const tenantId = access.session.tenantId;
  const userId = access.session.userId;

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ''));
    const documentId = String(params.documentId || '').trim();
    const action = String(params.action || 'metadata').trim().toLowerCase();
    if (!documentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'documentId is required.' });
    try {
      if (action === 'chunk') {
        const chunkIndex = toInt(params.chunkIndex);
        const rows = await selectRows('document_blob_chunks', `select=chunk_index,chunk_data&blob_id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&chunk_index=eq.${chunkIndex}&limit=1`);
        if (!rows?.length) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Encrypted file chunk was not found.' });
        return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, chunkIndex, chunkData: rows[0].chunk_data || '' });
      }
      const rows = await selectRows('document_blobs', `select=*&id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=1`);
      if (!rows?.length) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Encrypted file was not found for this account.' });
      const document = rows[0];
      if (chunkedMetadata(document.metadata) && document.metadata?.uploadComplete !== true) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'UPLOAD_INCOMPLETE', message: 'This encrypted file upload did not finish. Please upload it again.' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, document });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load the encrypted file.', error: error.message, details: error.details || null }); }
  }

  if (event.httpMethod === 'DELETE') {
    try { assertBrowserAction(event, { session: access.session, kind: 'customer', csrf: true }); }
    catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code || 'SECURE_REQUEST_REJECTED', message: error.message }); }
    const params = event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQuery || ''));
    const documentId = String(params.documentId || '').trim();
    if (!documentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'documentId is required.' });
    try {
      const rows = await selectRows('document_blobs', `select=id,tenant_id,user_id,file_size,storage_bytes,blob_kind&id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=1`);
      const existing = rows?.[0] || null;
      if (!existing?.id) return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, alreadyRemoved: true, entitlements: access.entitlementContext?.serialized || access.entitlements || null, message: 'Encrypted file storage was already clear.' });
      await deleteRow('document_blobs', `id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}`);
      const currentUsage = access.entitlementContext?.usage || { users: 0, documents: 0, pictures: 0, storageBytes: 0 };
      return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, removedBytes: Number(existing.storage_bytes || existing.file_size || 0), entitlements: serialiseEntitlements(access.entitlementContext?.effective || {}, usageAfterRemoval(currentUsage, existing)), message: 'Encrypted file storage removed for this account.' });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Encrypted file storage could not be removed.', error: error.message, details: error.details || null }); }
  }

  if (!requirePost(event)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET, POST or DELETE required.' });
  try { assertBrowserAction(event, { session: access.session, kind: 'customer', csrf: true }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code || 'SECURE_REQUEST_REJECTED', message: error.message }); }
  const body = parseBody(event);
  const action = String(body.action || 'save').trim().toLowerCase();
  const documentId = String(body.documentId || '').trim();
  if (!documentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'documentId is required.' });

  if (action === 'upload_chunk') {
    const chunkIndex = toInt(body.chunkIndex), chunkCount = toInt(body.chunkCount), chunkData = String(body.chunkData || '');
    if (!chunkData || chunkData.length > MAX_CHUNK_CHARACTERS || chunkCount < 1 || chunkCount > MAX_CHUNKS || chunkIndex >= chunkCount) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Encrypted file chunk details are invalid.' });
    try {
      const parents = await selectRows('document_blobs', `select=id,metadata&id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=1`);
      const parent = parents?.[0];
      if (!parent?.id || !chunkedMetadata(parent.metadata)) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Start the encrypted file upload before sending chunks.' });
      const existingChunks = await selectRows('document_blob_chunks', `select=chunk_index,chunk_data&blob_id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=${MAX_CHUNKS}`).catch(() => []);
      const projectedCharacters = (existingChunks || []).reduce((total, row) => total + (Number(row.chunk_index) === chunkIndex ? 0 : String(row.chunk_data || '').length), 0) + chunkData.length;
      if (projectedCharacters > MAX_ENCRYPTED_BLOB_CHARACTERS) return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'UPLOAD_TOO_LARGE', message: 'The encrypted file exceeds the secure 10 MB source-file upload allowance.' });
      await upsertRow('document_blob_chunks', { id: `${documentId}_${chunkIndex}`, blob_id: documentId, tenant_id: tenantId, user_id: userId, chunk_index: chunkIndex, chunk_data: chunkData, updated_at: new Date().toISOString() }, 'blob_id,chunk_index');
      return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, chunkIndex });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Encrypted file chunk could not be stored.', error: error.message }); }
  }

  if (action === 'finalize_chunked') {
    try {
      const parents = await selectRows('document_blobs', `select=id,file_name,file_size,storage_bytes,blob_kind,metadata&id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&limit=1`);
      const parent = parents?.[0], expected = toInt(parent?.metadata?.chunkCount);
      if (!parent?.id || !chunkedMetadata(parent.metadata) || expected < 1) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'This chunked upload was not initialised.' });
      const chunks = await selectRows('document_blob_chunks', `select=chunk_index,chunk_data&blob_id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}&order=chunk_index.asc&limit=${MAX_CHUNKS}`);
      if ((chunks || []).length !== expected || chunks.some((row, index) => Number(row.chunk_index) !== index)) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'UPLOAD_INCOMPLETE', message: 'Not all encrypted file chunks arrived. Please try the upload again.' });
      const totalCharacters = chunks.reduce((total, row) => total + String(row.chunk_data || '').length, 0);
      if (totalCharacters > MAX_ENCRYPTED_BLOB_CHARACTERS) {
        await deleteRow('document_blobs', `id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}`).catch(() => null);
        return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'UPLOAD_TOO_LARGE', message: 'The encrypted file exceeds the secure 10 MB source-file upload allowance.' });
      }
      const finalChunk = String(chunks[chunks.length - 1]?.chunk_data || '');
      const padding = finalChunk.endsWith('==') ? 2 : finalChunk.endsWith('=') ? 1 : 0;
      const actualStorageBytes = Math.max(0, Math.floor((totalCharacters * 3) / 4) - padding);
      const blobKind = normaliseBlobKind(parent.blob_kind);
      const usageKey = blobKind === 'picture' ? 'pictures' : 'documents';
      const limitKey = blobKind === 'picture' ? 'photoLimit' : 'documentLimit';
      const kindLimit = Number(access.entitlementContext?.effective?.limits?.[limitKey] || 0);
      const currentUsage = access.entitlementContext?.usage || {};
      if (kindLimit > 0 && Number(currentUsage?.[usageKey] || 0) > kindLimit) {
        await deleteRow('document_blobs', `id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}`).catch(() => null);
        return jsonResponse(409, { ok: false, version: APP_VERSION, code: blobKind === 'picture' ? 'PHOTO_LIMIT_REACHED' : 'DOCUMENT_LIMIT_REACHED', feature: blobKind === 'picture' ? 'pictures' : 'documents', upgradeRequired: true, entitlements: access.entitlementContext?.serialized || access.entitlements || null, message: `This plan has reached its ${kindLimit}-${blobKind} limit.` });
      }
      const decision = entitlementDecision(access, parent, { blobKind, storageBytes: actualStorageBytes });
      if (decision.error) {
        await deleteRow('document_blobs', `id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}`).catch(() => null);
        return decision.error;
      }
      await updateRow('document_blobs', `id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}`, { storage_bytes: actualStorageBytes, metadata: { ...(parent.metadata || {}), uploadComplete: true, completedAt: new Date().toISOString() }, updated_at: new Date().toISOString() });
      return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, blobKind, fileName: parent.file_name, fileSize: parent.file_size, storageBytes: actualStorageBytes, entitlements: decision.serialized, message: 'Encrypted file upload completed.' });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Encrypted file upload could not be finalised.', error: error.message }); }
  }

  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim(), localIv = String(body.localIv || '').trim();
  const fileName = String(body.fileName || '').trim(), fileType = String(body.fileType || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileExtension = String(body.fileExtension || '').trim().toLowerCase(), fileSize = toInt(body.fileSize), blobKind = normaliseBlobKind(body.blobKind);
  const isChunkedInit = action === 'init_chunked', chunkCount = toInt(body.chunkCount);
  const storageBytes = isChunkedInit ? toInt(body.encryptedStorageBytes) : Math.max(fileSize, base64ByteLength(encryptedBlob));
  if (!localSalt || !localIv || !fileName || (!isChunkedInit && !encryptedBlob)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'fileName and encrypted file data are required.' });
  if (blobKind === 'picture' && !ALLOWED_PICTURE_EXTENSIONS.has(fileExtension) && !ALLOWED_PICTURE_MIME_TYPES.has(fileType.toLowerCase())) return jsonResponse(415, { ok: false, version: APP_VERSION, code: 'PICTURE_TYPE_NOT_SUPPORTED', message: 'Supported pictures are JPG, JPEG, PNG, WEBP, HEIC and HEIF.' });
  if (fileSize > MAX_UPLOAD_BYTES) return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'UPLOAD_TOO_LARGE', message: `${blobKind === 'picture' ? 'Pictures' : 'Documents'} larger than 10 MB are not supported.` });
  if (isChunkedInit && (chunkCount < 1 || chunkCount > MAX_CHUNKS || storageBytes < 1)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Encrypted file chunk details are invalid.' });
  try {
    const existing = await selectRows('document_blobs', `select=id,tenant_id,user_id,file_size,storage_bytes,blob_kind&id=eq.${safeEq(documentId)}&limit=1`);
    if (existing?.[0] && (existing[0].tenant_id !== tenantId || existing[0].user_id !== userId)) return jsonResponse(403, { ok: false, version: APP_VERSION, message: 'This encrypted file identifier belongs to another account.' });
    const decision = entitlementDecision(access, existing?.[0] || null, { blobKind, storageBytes });
    if (decision.error) return decision.error;
    if (isChunkedInit) await deleteRow('document_blob_chunks', `blob_id=eq.${safeEq(documentId)}&tenant_id=eq.${safeEq(tenantId)}&user_id=eq.${safeEq(userId)}`).catch(() => null);
    const metadata = isChunkedInit ? { version: APP_VERSION, storageMode: 'chunked_encrypted_file_v1', blobKind, chunkCount, uploadComplete: false, tenant_identity_source: 'secure_session', clientUpdatedAt: body.clientUpdatedAt || new Date().toISOString() } : { version: APP_VERSION, storageMode: `external_encrypted_${blobKind}_blob`, blobKind, tenant_identity_source: 'secure_session', clientUpdatedAt: body.clientUpdatedAt || new Date().toISOString() };
    const saved = await upsertRow('document_blobs', { id: documentId, tenant_id: tenantId, user_id: userId, file_name: fileName, file_type: fileType, file_extension: fileExtension, file_size: fileSize, storage_bytes: storageBytes, blob_kind: blobKind, encrypted_blob: isChunkedInit ? CHUNKED_SENTINEL : encryptedBlob, local_salt: localSalt, local_iv: localIv, metadata, updated_at: new Date().toISOString() }, 'id');
    return jsonResponse(200, { ok: true, version: APP_VERSION, documentId, blobKind, fileName: saved?.file_name || fileName, fileSize: saved?.file_size || fileSize, storageBytes: saved?.storage_bytes || storageBytes, entitlements: decision.serialized, chunked: isChunkedInit, message: isChunkedInit ? 'Encrypted file upload started.' : 'Encrypted file stored for the authenticated account.' });
  } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Encrypted file could not be stored.', error: error.message, details: error.details || null }); }
}
