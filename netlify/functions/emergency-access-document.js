import { createHash } from 'node:crypto';
import { APP_VERSION, deleteRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow, upsertRow } from './_db.js';
import { getCustomerAccess } from './_session.js';
import { assertBrowserAction, consumeRateLimit } from './_security.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_CHUNK_CHARACTERS = 2_500_000;
const MAX_CHUNKS = 32;
const MAX_ENCRYPTED_BLOB_CHARACTERS = 20_000_000;
const CHUNKED_SENTINEL = '__chunked_emergency_file_v1__';

function eq(value) { return `eq.${encodeURIComponent(String(value || ''))}`; }
function clean(value, max = 220) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function toInt(value) { const number = Number(value || 0); return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0; }
function tokenHash(token) { const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite'; return createHash('sha256').update(`${token}:${secret}`).digest('hex'); }
function normaliseImportCode(value) { return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 20); }
function importCodeHash(value) { return createHash('sha256').update(`Password-Encrypt emergency import code v1:${normaliseImportCode(value)}`).digest('hex'); }
function normaliseEmail(value) { return String(value || '').trim().toLowerCase(); }
function releaseExpired(request) { const value = request?.metadata?.release_expires_at || ''; if (!value) return false; const time = new Date(value).getTime(); return Number.isFinite(time) && time <= Date.now(); }
function isChunked(document = {}) { return String(document?.metadata?.storage_mode || '') === 'chunked_emergency_file_v1'; }

async function ownerAccess(event) {
  const access = await getCustomerAccess(event);
  if (!access.ok) return { error: jsonResponse(access.code === 'SESSION_REQUIRED' ? 401 : 403, { ok: false, version: APP_VERSION, code: access.code, message: access.message }) };
  try { assertBrowserAction(event, { session: access.session, kind: 'customer', csrf: true }); }
  catch (error) { return { error: jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code || 'SECURE_REQUEST_REJECTED', message: error.message }) }; }
  return { access };
}
async function releasedDocumentForToken(token, sourceDocumentId) {
  const invitationRows = await selectRows('emergency_access_invitations', `select=id,status,invite_token_hash&invite_token_hash=${eq(tokenHash(token))}&limit=1`);
  const invitation = invitationRows?.[0];
  if (!invitation?.id) return { error: jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This Emergency Access link was not found.' }) };
  if (String(invitation.status || '').toLowerCase() !== 'accepted') return { error: jsonResponse(403, { ok: false, version: APP_VERSION, message: 'Emergency files are not available from this invitation.' }) };
  const requests = await selectRows('emergency_access_requests', `select=id,status,metadata&invitation_id=${eq(invitation.id)}&status=eq.release_ready&order=updated_at.desc&limit=1`);
  const request = requests?.[0];
  if (!request?.id) return { error: jsonResponse(403, { ok: false, version: APP_VERSION, message: 'The Emergency Access waiting period has not completed.' }) };
  if (releaseExpired(request)) return { error: jsonResponse(410, { ok: false, version: APP_VERSION, code: 'EMERGENCY_PACKAGE_EXPIRED', message: 'This Emergency Package link has expired.' }) };
  const rows = await selectRows('emergency_access_documents', `select=id,source_document_id,file_name,file_type,file_extension,file_size,encrypted_blob,local_salt,local_iv,metadata,updated_at&invitation_id=${eq(invitation.id)}&source_document_id=${eq(sourceDocumentId)}&limit=1`);
  const document = rows?.[0];
  if (!document?.encrypted_blob) return { error: jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This released file is not available.' }) };
  if (isChunked(document) && document.metadata?.upload_complete !== true) return { error: jsonResponse(409, { ok: false, version: APP_VERSION, code: 'UPLOAD_INCOMPLETE', message: 'This released file was not fully prepared. The account owner must refresh the Emergency Package.' }) };
  return { document };
}
async function releasedDocumentForImport(importCode, sourceDocumentId, session) {
  const invitationRows = await selectRows('emergency_access_invitations', `select=id,status,contact_email,emergency_import_code_hash&emergency_import_code_hash=${eq(importCodeHash(importCode))}&limit=1`);
  const invitation = invitationRows?.[0];
  if (!invitation?.id) return { error: jsonResponse(404, { ok: false, version: APP_VERSION, code: 'IMPORT_CODE_NOT_FOUND', message: 'That Emergency Package import code was not recognised.' }) };
  const userRows = await selectRows('users', `select=email,email_verified&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`).catch(() => []);
  const user = userRows?.[0];
  if (!user?.email_verified || normaliseEmail(user.email) !== normaliseEmail(invitation.contact_email)) return { error: jsonResponse(403, { ok: false, version: APP_VERSION, code: 'IMPORT_IDENTITY_MISMATCH', message: 'This Emergency Package was released to a different email address. Sign in to the Password-Encrypt account that uses the nominated email address.' }) };
  const requests = await selectRows('emergency_access_requests', `select=id,status,metadata&invitation_id=${eq(invitation.id)}&status=eq.release_ready&order=updated_at.desc&limit=1`);
  const request = requests?.[0];
  if (!request?.id) return { error: jsonResponse(403, { ok: false, version: APP_VERSION, code: 'IMPORT_NOT_RELEASED', message: 'This Emergency Package has not been released yet.' }) };
  if (releaseExpired(request)) return { error: jsonResponse(410, { ok: false, version: APP_VERSION, code: 'EMERGENCY_PACKAGE_EXPIRED', message: 'This Emergency Package import code has expired.' }) };
  const rows = await selectRows('emergency_access_documents', `select=id,source_document_id,file_name,file_type,file_extension,file_size,encrypted_blob,local_salt,local_iv,metadata,updated_at&invitation_id=${eq(invitation.id)}&source_document_id=${eq(sourceDocumentId)}&limit=1`);
  const document = rows?.[0];
  if (!document?.encrypted_blob) return { error: jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This released file is not available.' }) };
  if (String(document?.metadata?.encryption_scope || '') !== 'emergency_import_code_v1') return { error: jsonResponse(409, { ok: false, version: APP_VERSION, code: 'IMPORT_CODE_PACKAGE_REFRESH_REQUIRED', message: 'This file was prepared with an older Emergency Package version. The account owner must refresh the package before code import can be used.' }) };
  if (isChunked(document) && document.metadata?.upload_complete !== true) return { error: jsonResponse(409, { ok: false, version: APP_VERSION, code: 'UPLOAD_INCOMPLETE', message: 'This released file was not fully prepared. The account owner must refresh the Emergency Package.' }) };
  return { document };
}
async function readEmergencyChunk(document, chunkIndex) { const rows = await selectRows('emergency_access_document_chunks', `select=chunk_index,chunk_data&document_id=${eq(document.id)}&chunk_index=${eq(chunkIndex)}&limit=1`); return rows?.[0] || null; }

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  const body = parseBody(event);
  const action = clean(body.action, 40).toLowerCase();

  if (action === 'open' || action === 'open_chunk') {
    const token = String(body.token || '').trim(), sourceDocumentId = clean(body.sourceDocumentId, 180);
    if (!token || !sourceDocumentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Secure token and file details are required.' });
    await consumeRateLimit(event, { scope: 'emergency_document_open', identifier: tokenHash(token), limit: 180, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    try {
      const resolved = await releasedDocumentForToken(token, sourceDocumentId); if (resolved.error) return resolved.error;
      if (action === 'open_chunk') {
        if (!isChunked(resolved.document)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This released file does not use chunked storage.' });
        const chunkIndex = toInt(body.chunkIndex), chunk = await readEmergencyChunk(resolved.document, chunkIndex);
        if (!chunk) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Released file chunk was not found.' });
        return jsonResponse(200, { ok: true, version: APP_VERSION, sourceDocumentId, chunkIndex, chunkData: chunk.chunk_data || '' });
      }
      return jsonResponse(200, { ok: true, version: APP_VERSION, document: resolved.document });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'The released file could not be opened.', error: error.message }); }
  }

  if (action === 'open_import' || action === 'open_import_chunk') {
    let secured; try { secured = await ownerAccess(event); } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not check account access.', error: error.message }); }
    if (secured.error) return secured.error;
    const { session } = secured.access;
    const importCode = normaliseImportCode(body.importCode), sourceDocumentId = clean(body.sourceDocumentId, 180);
    if (importCode.length !== 20 || !sourceDocumentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Import code and file details are required.' });
    await consumeRateLimit(event, { scope: 'emergency_document_import_open', identifier: `${session.userId}:${importCodeHash(importCode)}`, limit: 180, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    try {
      const resolved = await releasedDocumentForImport(importCode, sourceDocumentId, session); if (resolved.error) return resolved.error;
      if (action === 'open_import_chunk') {
        if (!isChunked(resolved.document)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This released file does not use chunked storage.' });
        const chunkIndex = toInt(body.chunkIndex), chunk = await readEmergencyChunk(resolved.document, chunkIndex);
        if (!chunk) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Released file chunk was not found.' });
        return jsonResponse(200, { ok: true, version: APP_VERSION, sourceDocumentId, chunkIndex, chunkData: chunk.chunk_data || '' });
      }
      return jsonResponse(200, { ok: true, version: APP_VERSION, document: resolved.document });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'The Emergency Package file could not be opened for import.', error: error.message }); }
  }

  let secured; try { secured = await ownerAccess(event); } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not check account access.', error: error.message }); }
  if (secured.error) return secured.error;
  const { session } = secured.access;
  if (session.entitlements?.features?.emergencyAccess === false) return jsonResponse(403, { ok: false, version: APP_VERSION, code: 'PLAN_FEATURE_REQUIRED', feature: 'emergencyAccess', message: 'Emergency Access is not included in this plan.' });
  const invitationId = clean(body.invitationId, 180);
  if (!invitationId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are required.' });
  const invitationRows = await selectRows('emergency_access_invitations', `select=id,status&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&id=${eq(invitationId)}&limit=1`).catch(() => []);
  if (!invitationRows?.[0]?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Emergency invitation was not found for this account.' });
  const requestRows = await selectRows('emergency_access_requests', `select=id,status,released_at&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&invitation_id=${eq(invitationId)}&order=created_at.desc&limit=1`).catch(() => []);
  const latestRequest = requestRows?.[0] || null;
  const packageFrozen = Boolean(latestRequest?.released_at || ['release_ready', 'released'].includes(String(latestRequest?.status || '').toLowerCase()));
  if (action === 'inventory') {
    const documents = await selectRows('emergency_access_documents', `select=source_document_id,file_name,file_type,file_extension,file_size,metadata,updated_at&invitation_id=${eq(invitationId)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&limit=500`).catch(() => []);
    return jsonResponse(200, { ok: true, version: APP_VERSION, frozen: packageFrozen, documents: documents || [] });
  }
  if (packageFrozen) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'EMERGENCY_PACKAGE_FROZEN', message: 'The Emergency Package has already been released and is frozen as the release snapshot.' });
  if (action === 'prune') {
    const keep = new Set((Array.isArray(body.keepSourceDocumentIds) ? body.keepSourceDocumentIds : []).map((value) => clean(value, 180)).filter(Boolean));
    const existing = await selectRows('emergency_access_documents', `select=id,source_document_id&invitation_id=${eq(invitationId)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&limit=500`).catch(() => []);
    let removed = 0;
    for (const row of existing || []) if (!keep.has(String(row.source_document_id || ''))) { await deleteRow('emergency_access_documents', `id=${eq(row.id)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}`).catch(() => null); removed += 1; }
    return jsonResponse(200, { ok: true, version: APP_VERSION, removed, kept: keep.size });
  }
  const sourceDocumentId = clean(body.sourceDocumentId, 180);
  if (!sourceDocumentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Source file details are required.' });
  if (action === 'upload_chunk') {
    const chunkIndex = toInt(body.chunkIndex), chunkCount = toInt(body.chunkCount), chunkData = String(body.chunkData || '');
    if (!chunkData || chunkData.length > MAX_CHUNK_CHARACTERS || chunkCount < 1 || chunkCount > MAX_CHUNKS || chunkIndex >= chunkCount) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Emergency file chunk details are invalid.' });
    try {
      const rows = await selectRows('emergency_access_documents', `select=id,metadata&invitation_id=${eq(invitationId)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&source_document_id=${eq(sourceDocumentId)}&limit=1`);
      const document = rows?.[0];
      if (!document?.id || !isChunked(document)) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Start preparing this Emergency Package file before sending chunks.' });
      const existingChunks = await selectRows('emergency_access_document_chunks', `select=chunk_index,chunk_data&document_id=${eq(document.id)}&limit=${MAX_CHUNKS}`).catch(() => []);
      const projectedCharacters = (existingChunks || []).reduce((total, row) => total + (Number(row.chunk_index) === chunkIndex ? 0 : String(row.chunk_data || '').length), 0) + chunkData.length;
      if (projectedCharacters > MAX_ENCRYPTED_BLOB_CHARACTERS) return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'FILE_TOO_LARGE', message: 'The encrypted Emergency Package file exceeds the secure 10 MB source-file allowance.' });
      await upsertRow('emergency_access_document_chunks', { id: `${document.id}_${chunkIndex}`, document_id: document.id, chunk_index: chunkIndex, chunk_data: chunkData, updated_at: new Date().toISOString() }, 'document_id,chunk_index');
      return jsonResponse(200, { ok: true, version: APP_VERSION, sourceDocumentId, chunkIndex });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Emergency file chunk could not be saved.', error: error.message }); }
  }
  if (action === 'finalize_chunked') {
    try {
      const rows = await selectRows('emergency_access_documents', `select=id,metadata&invitation_id=${eq(invitationId)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&source_document_id=${eq(sourceDocumentId)}&limit=1`);
      const document = rows?.[0], expected = toInt(document?.metadata?.chunk_count);
      if (!document?.id || !isChunked(document) || expected < 1) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'This Emergency Package file was not initialised for chunked upload.' });
      const chunks = await selectRows('emergency_access_document_chunks', `select=chunk_index,chunk_data&document_id=${eq(document.id)}&order=chunk_index.asc&limit=${MAX_CHUNKS}`);
      if ((chunks || []).length !== expected || chunks.some((row, index) => Number(row.chunk_index) !== index)) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'UPLOAD_INCOMPLETE', message: 'Not all Emergency Package file chunks arrived. Please refresh the package again.' });
      const totalCharacters = chunks.reduce((total, row) => total + String(row.chunk_data || '').length, 0);
      if (totalCharacters > MAX_ENCRYPTED_BLOB_CHARACTERS) {
        await deleteRow('emergency_access_documents', `id=${eq(document.id)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}`).catch(() => null);
        return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'FILE_TOO_LARGE', message: 'The encrypted Emergency Package file exceeds the secure 10 MB source-file allowance.' });
      }
      await updateRow('emergency_access_documents', `id=${eq(document.id)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}`, { metadata: { ...(document.metadata || {}), upload_complete: true, completed_at: new Date().toISOString() }, updated_at: new Date().toISOString() });
      return jsonResponse(200, { ok: true, version: APP_VERSION, sourceDocumentId });
    } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Emergency Package file could not be finalised.', error: error.message }); }
  }
  if (action !== 'save' && action !== 'init_chunked') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown emergency file action.' });
  const fileName = clean(body.fileName, 220), fileType = clean(body.fileType || 'application/octet-stream', 160) || 'application/octet-stream', fileExtension = clean(body.fileExtension, 30).toLowerCase();
  const fileSize = toInt(body.fileSize), encryptedBlob = String(body.encryptedBlob || '').trim(), localSalt = String(body.localSalt || '').trim(), localIv = String(body.localIv || '').trim();
  const sourceFingerprint = clean(body.sourceFingerprint, 128), sourceUpdatedAt = clean(body.sourceUpdatedAt, 80), sourceCategory = clean(body.sourceCategory || 'Documents', 80) || 'Documents';
  const encryptionScope = clean(body.encryptionScope || 'trusted_person_invite_token', 80), chunkCount = toInt(body.chunkCount), chunked = action === 'init_chunked';
  if (!fileName || !localSalt || !localIv || (!chunked && !encryptedBlob)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'File metadata and encrypted content are required.' });
  if (fileSize > MAX_FILE_BYTES) return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'FILE_TOO_LARGE', message: 'Emergency Package files larger than 10 MB are not supported.' });
  if (chunked && (chunkCount < 1 || chunkCount > MAX_CHUNKS)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Emergency file chunk details are invalid.' });
  try {
    const existing = await selectRows('emergency_access_documents', `select=id&invitation_id=${eq(invitationId)}&source_document_id=${eq(sourceDocumentId)}&limit=1`).catch(() => []);
    const id = existing?.[0]?.id || publicId('emergencydoc');
    if (chunked) await deleteRow('emergency_access_document_chunks', `document_id=${eq(id)}`).catch(() => null);
    await upsertRow('emergency_access_documents', { id, invitation_id: invitationId, tenant_id: session.tenantId, user_id: session.userId, source_document_id: sourceDocumentId, file_name: fileName, file_type: fileType, file_extension: fileExtension, file_size: fileSize, encrypted_blob: chunked ? CHUNKED_SENTINEL : encryptedBlob, local_salt: localSalt, local_iv: localIv, metadata: { version: APP_VERSION, encryption_scope: encryptionScope, owner_plaintext_sent_to_server: false, source_fingerprint: sourceFingerprint, source_updated_at: sourceUpdatedAt, source_category: sourceCategory, ...(chunked ? { storage_mode: 'chunked_emergency_file_v1', chunk_count: chunkCount, upload_complete: false } : {}) }, updated_at: new Date().toISOString() }, 'invitation_id,source_document_id');
    return jsonResponse(200, { ok: true, version: APP_VERSION, sourceDocumentId, fileName, fileSize, chunked });
  } catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'The Emergency Package file copy could not be saved.', error: error.message }); }
}
