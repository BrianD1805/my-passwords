import { createHash } from 'node:crypto';
import { APP_VERSION, deleteRow, jsonResponse, parseBody, publicId, requirePost, selectRows, upsertRow } from './_db.js';
import { getCustomerAccess } from './_session.js';
import { assertBrowserAction, consumeRateLimit } from './_security.js';

function eq(value) { return `eq.${encodeURIComponent(String(value || ''))}`; }
function clean(value, max = 220) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function tokenHash(token) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite';
  return createHash('sha256').update(`${token}:${secret}`).digest('hex');
}
function releaseExpired(request) {
  const value = request?.metadata?.release_expires_at || '';
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

async function ownerAccess(event) {
  const access = await getCustomerAccess(event);
  if (!access.ok) return { error: jsonResponse(access.code === 'SESSION_REQUIRED' ? 401 : 403, { ok: false, version: APP_VERSION, code: access.code, message: access.message }) };
  try { assertBrowserAction(event, { session: access.session, kind: 'customer', csrf: true }); }
  catch (error) { return { error: jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code || 'SECURE_REQUEST_REJECTED', message: error.message }) }; }
  return { access };
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  const body = parseBody(event);
  const action = clean(body.action, 40).toLowerCase();

  if (action === 'open') {
    const token = String(body.token || '').trim();
    const sourceDocumentId = clean(body.sourceDocumentId, 180);
    if (!token || !sourceDocumentId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Secure token and document details are required.' });
    await consumeRateLimit(event, { scope: 'emergency_document_open', identifier: tokenHash(token), limit: 90, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    try {
      const invitationRows = await selectRows('emergency_access_invitations', `select=id,status,invite_token_hash&invite_token_hash=${eq(tokenHash(token))}&limit=1`);
      const invitation = invitationRows?.[0];
      if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This Emergency Access link was not found.' });
      if (String(invitation.status || '').toLowerCase() !== 'accepted') return jsonResponse(403, { ok: false, version: APP_VERSION, message: 'Emergency documents are not available from this invitation.' });
      const requests = await selectRows('emergency_access_requests', `select=id,status,metadata&invitation_id=${eq(invitation.id)}&status=eq.release_ready&order=updated_at.desc&limit=1`);
      const request = requests?.[0];
      if (!request?.id) return jsonResponse(403, { ok: false, version: APP_VERSION, message: 'The Emergency Access waiting period has not completed.' });
      if (releaseExpired(request)) return jsonResponse(410, { ok: false, version: APP_VERSION, code: 'EMERGENCY_PACKAGE_EXPIRED', message: 'This Emergency Package link has expired.' });
      const rows = await selectRows('emergency_access_documents', `select=source_document_id,file_name,file_type,file_extension,file_size,encrypted_blob,local_salt,local_iv,updated_at&invitation_id=${eq(invitation.id)}&source_document_id=${eq(sourceDocumentId)}&limit=1`);
      const document = rows?.[0];
      if (!document?.encrypted_blob) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This released document is not available.' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, document });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'The released document could not be opened.', error: error.message });
    }
  }

  let secured;
  try { secured = await ownerAccess(event); }
  catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not check account access.', error: error.message }); }
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

  if (packageFrozen) {
    return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'EMERGENCY_PACKAGE_FROZEN', message: 'The Emergency Package has already been released and is frozen as the release snapshot.' });
  }

  if (action === 'prune') {
    const keep = new Set((Array.isArray(body.keepSourceDocumentIds) ? body.keepSourceDocumentIds : []).map((value) => clean(value, 180)).filter(Boolean));
    const existing = await selectRows('emergency_access_documents', `select=id,source_document_id&invitation_id=${eq(invitationId)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&limit=500`).catch(() => []);
    let removed = 0;
    for (const row of existing || []) {
      if (!keep.has(String(row.source_document_id || ''))) {
        await deleteRow('emergency_access_documents', `id=${eq(row.id)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}`).catch(() => null);
        removed += 1;
      }
    }
    return jsonResponse(200, { ok: true, version: APP_VERSION, removed, kept: keep.size });
  }

  if (action !== 'save') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown emergency document action.' });

  const sourceDocumentId = clean(body.sourceDocumentId, 180);
  const fileName = clean(body.fileName, 220);
  const fileType = clean(body.fileType || 'application/octet-stream', 160) || 'application/octet-stream';
  const fileExtension = clean(body.fileExtension, 30).toLowerCase();
  const fileSize = Math.max(0, Math.round(Number(body.fileSize || 0)));
  const encryptedBlob = String(body.encryptedBlob || '').trim();
  const localSalt = String(body.localSalt || '').trim();
  const localIv = String(body.localIv || '').trim();
  const sourceFingerprint = clean(body.sourceFingerprint, 128);
  const sourceUpdatedAt = clean(body.sourceUpdatedAt, 80);
  if (!sourceDocumentId || !fileName || !encryptedBlob || !localSalt || !localIv) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Document metadata and encrypted content are required.' });
  if (fileSize > 10 * 1024 * 1024) return jsonResponse(413, { ok: false, version: APP_VERSION, code: 'DOCUMENT_TOO_LARGE', message: 'Documents larger than 10 MB are not supported.' });

  try {
    const existing = await selectRows('emergency_access_documents', `select=id&invitation_id=${eq(invitationId)}&source_document_id=${eq(sourceDocumentId)}&limit=1`).catch(() => []);
    const id = existing?.[0]?.id || publicId('emergencydoc');
    await upsertRow('emergency_access_documents', {
      id,
      invitation_id: invitationId,
      tenant_id: session.tenantId,
      user_id: session.userId,
      source_document_id: sourceDocumentId,
      file_name: fileName,
      file_type: fileType,
      file_extension: fileExtension,
      file_size: fileSize,
      encrypted_blob: encryptedBlob,
      local_salt: localSalt,
      local_iv: localIv,
      metadata: { version: APP_VERSION, encryption_scope: 'trusted_person_invite_token', owner_plaintext_sent_to_server: false, source_fingerprint: sourceFingerprint, source_updated_at: sourceUpdatedAt },
      updated_at: new Date().toISOString()
    }, 'invitation_id,source_document_id');
    return jsonResponse(200, { ok: true, version: APP_VERSION, sourceDocumentId, fileName, fileSize });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'The emergency document copy could not be saved.', error: error.message });
  }
}
