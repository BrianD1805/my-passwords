import { insertRow, publicId, selectRows, updateRow } from './_db.js';
import { issueAdminSession, readAdminSession } from './_auth.js';
import { requestIpHash } from './_security.js';

const ADMIN_SESSION_HOURS = 8;
const ADMIN_ROTATE_HOURS = 2;

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function header(event, name) { return event?.headers?.[name] || event?.headers?.[name.toLowerCase()] || ''; }
function clean(value, max = 500) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function expiry(hours = ADMIN_SESSION_HOURS) { return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(); }

export async function createAdminSession(event) {
  const now = new Date().toISOString();
  const expiresAt = expiry();
  const row = await insertRow('admin_sessions', {
    id: publicId('admin_session'), status: 'active', issued_at: now, expires_at: expiresAt, last_seen_at: now,
    ip_hash: requestIpHash(event), user_agent: clean(header(event, 'user-agent'), 500),
    metadata: { created_by: 'admin_access_key' }, created_at: now, updated_at: now
  });
  return { session: row, cookie: issueAdminSession(event, { sessionId: row.id, expiresAt }) };
}

export async function validateAdminSession(event, { touch = false } = {}) {
  const token = readAdminSession(event);
  if (!token?.sessionId) return { ok: false, code: 'ADMIN_SESSION_REQUIRED' };
  const rows = await selectRows('admin_sessions', `select=*&id=${eq(token.sessionId)}&limit=1`).catch(() => []);
  const row = rows?.[0];
  if (!row?.id || row.status !== 'active' || row.revoked_at) return { ok: false, code: 'ADMIN_SESSION_REVOKED' };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await updateRow('admin_sessions', `id=${eq(row.id)}`, { status: 'expired', updated_at: new Date().toISOString() }).catch(() => null);
    return { ok: false, code: 'ADMIN_SESSION_EXPIRED' };
  }
  const age = Date.now() - new Date(row.issued_at).getTime();
  if (touch) await updateRow('admin_sessions', `id=${eq(row.id)}`, { last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).catch(() => null);
  return { ok: true, session: { ...token, sessionId: row.id }, stored: row, rotateRequired: age >= ADMIN_ROTATE_HOURS * 60 * 60 * 1000 };
}

export async function rotateAdminSession(event, validation) {
  if (!validation?.ok || !validation.rotateRequired) return null;
  const created = await createAdminSession(event);
  const now = new Date().toISOString();
  await updateRow('admin_sessions', `id=${eq(validation.stored.id)}`, { status: 'revoked', revoked_at: now, revoked_reason: 'rotated', updated_at: now }).catch(() => null);
  return created;
}

export async function revokeAdminSession(sessionId, reason = 'logout') {
  if (!sessionId) return null;
  const now = new Date().toISOString();
  return updateRow('admin_sessions', `id=${eq(sessionId)}`, { status: 'revoked', revoked_at: now, revoked_reason: clean(reason, 120), updated_at: now }).catch(() => null);
}
