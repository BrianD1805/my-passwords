import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { APP_VERSION, insertRow, publicId, selectRows, supabaseRequest, updateRow } from './_db.js';

function clean(value, max = 500) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function header(event, name) {
  return event?.headers?.[name] || event?.headers?.[name.toLowerCase()] || event?.headers?.[name.toUpperCase()] || '';
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function securitySecret(kind = 'customer') {
  const production = process.env.CONTEXT === 'production';
  if (kind === 'admin') {
    if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
    if (!production) return process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    return '';
  }
  if (process.env.CUSTOMER_SESSION_SECRET) return process.env.CUSTOMER_SESSION_SECRET;
  if (!production) return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return '';
}

function requireSecuritySecret(kind = 'customer') {
  const secret = securitySecret(kind);
  if (!secret) throw new Error(`${kind === 'admin' ? 'ADMIN_SESSION_SECRET' : 'CUSTOMER_SESSION_SECRET'} is required for security controls.`);
  return secret;
}

export function requestIpHash(event) {
  const netlifyIp = clean(header(event, 'x-nf-client-connection-ip'), 120);
  const forwarded = clean(header(event, 'x-forwarded-for'), 240).split(',')[0].trim();
  const direct = clean(header(event, 'client-ip'), 120);
  const ip = netlifyIp || forwarded || direct || 'unknown';
  const secret = requireSecuritySecret('customer');
  return createHmac('sha256', secret).update(ip).digest('hex');
}

export function hashSecurityIdentifier(scope, identifier, event) {
  const secret = requireSecuritySecret('customer');
  const material = `${clean(scope, 100)}:${clean(identifier, 500).toLowerCase()}`;
  return createHmac('sha256', secret).update(material).digest('hex');
}

function configuredOrigins() {
  const values = [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const origins = new Set();
  for (const value of values) {
    try { origins.add(new URL(value).origin); } catch { /* ignore malformed environment values */ }
  }
  if (process.env.CONTEXT !== 'production') {
    origins.add('http://localhost:8888');
    origins.add('http://127.0.0.1:8888');
    origins.add('http://localhost:5173');
    origins.add('http://127.0.0.1:5173');
  }
  return origins;
}

export function assertTrustedOrigin(event, { allowMissingOrigin = false } = {}) {
  const origin = clean(header(event, 'origin'), 500);
  if (!origin) {
    if (allowMissingOrigin || process.env.CONTEXT !== 'production') return true;
    const error = new Error('The request origin could not be verified. Refresh My Passwords and try again.');
    error.status = 403;
    error.code = 'ORIGIN_REQUIRED';
    throw error;
  }
  if (!configuredOrigins().has(origin)) {
    const error = new Error('This request did not come from an approved My Passwords origin.');
    error.status = 403;
    error.code = 'ORIGIN_REJECTED';
    throw error;
  }
  return true;
}

export function csrfTokenForSession(session, kind = 'customer') {
  const id = clean(session?.sessionId || session?.jti || '', 180);
  const secret = securitySecret(kind);
  if (!id || !secret) return '';
  return createHmac('sha256', secret).update(`csrf:${kind}:${id}`).digest('base64url');
}

export function assertCsrf(event, session, kind = 'customer') {
  const supplied = clean(header(event, 'x-mp-csrf'), 500);
  const expected = csrfTokenForSession(session, kind);
  if (!supplied || !expected || !safeEqual(supplied, expected)) {
    const error = new Error('Your secure request token has expired. Refresh My Passwords and try again.');
    error.status = 403;
    error.code = 'CSRF_REJECTED';
    throw error;
  }
  return true;
}

export function assertBrowserAction(event, { session = null, kind = 'customer', csrf = true, allowMissingOrigin = false } = {}) {
  assertTrustedOrigin(event, { allowMissingOrigin });
  const marker = clean(header(event, 'x-mp-request'), 40);
  if (marker !== '1') {
    const error = new Error('The secure request marker is missing. Refresh My Passwords and try again.');
    error.status = 403;
    error.code = 'REQUEST_MARKER_REQUIRED';
    throw error;
  }
  if (csrf && session) assertCsrf(event, session, kind);
  return true;
}

export async function consumeRateLimit(event, { scope, identifier = '', limit = 5, windowSeconds = 900, blockSeconds = 900 } = {}) {
  const identifierHash = hashSecurityIdentifier(scope, identifier || requestIpHash(event), event);
  let result;
  try {
    result = await supabaseRequest('rpc/consume_security_rate_limit', {
      method: 'POST',
      body: JSON.stringify({
        p_scope: clean(scope, 100),
        p_identifier_hash: identifierHash,
        p_limit: Math.max(1, Number(limit || 1)),
        p_window_seconds: Math.max(1, Number(windowSeconds || 1)),
        p_block_seconds: Math.max(1, Number(blockSeconds || 1))
      })
    });
  } catch (error) {
    const wrapped = new Error(process.env.CONTEXT === 'production'
      ? 'Security rate limiting is not ready. Apply the Ver-0.050 Supabase migration before using this action.'
      : `Security rate limiting is unavailable locally: ${error.message}`);
    wrapped.status = 503;
    wrapped.code = 'SECURITY_RATE_LIMIT_UNAVAILABLE';
    throw wrapped;
  }
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.allowed) {
    const error = new Error('Too many attempts. Please wait before trying again.');
    error.status = 429;
    error.code = 'RATE_LIMITED';
    error.retryAfter = Math.max(1, Number(row?.retry_after || 60));
    throw error;
  }
  return row;
}

export async function resetRateLimit(event, { scope, identifier = '' } = {}) {
  const identifierHash = hashSecurityIdentifier(scope, identifier || requestIpHash(event), event);
  await supabaseRequest('rpc/reset_security_rate_limit', {
    method: 'POST',
    body: JSON.stringify({ p_scope: clean(scope, 100), p_identifier_hash: identifierHash })
  }).catch(() => null);
}

export function requestHash(payload) {
  const canonical = JSON.stringify(payload && typeof payload === 'object' ? payload : {});
  return createHash('sha256').update(canonical).digest('hex');
}

export async function claimIdempotency({ scope, requestId, tenantId = null, userId = null, payload = {} }) {
  const id = clean(requestId, 180);
  if (!id) {
    const error = new Error('A unique request ID is required for this action.');
    error.status = 400;
    error.code = 'REQUEST_ID_REQUIRED';
    throw error;
  }
  const key = `${clean(scope, 100)}:${id}`;
  const hash = requestHash(payload);
  const rows = await selectRows('security_idempotency_keys', `select=id,request_hash,status&key=eq.${encodeURIComponent(key)}&limit=1`).catch(() => []);
  const existing = rows?.[0];
  if (existing?.id) {
    const error = new Error(existing.request_hash === hash
      ? 'This request has already been received. Refresh the current status before trying again.'
      : 'That request ID was already used for a different action.');
    error.status = 409;
    error.code = existing.request_hash === hash ? 'DUPLICATE_REQUEST' : 'REQUEST_ID_REUSED';
    throw error;
  }
  try {
    return await insertRow('security_idempotency_keys', {
      id: publicId('idem'), key, scope: clean(scope, 100), request_hash: hash,
      tenant_id: tenantId || null, user_id: userId || null, status: 'processing', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
  } catch (error) {
    const duplicate = new Error('This request is already being processed. Refresh the current status before trying again.');
    duplicate.status = 409;
    duplicate.code = 'DUPLICATE_REQUEST';
    throw duplicate;
  }
}

export async function completeIdempotency(claim, status = 'completed') {
  if (!claim?.id) return null;
  return updateRow('security_idempotency_keys', `id=eq.${encodeURIComponent(claim.id)}`, { status, updated_at: new Date().toISOString() }).catch(() => null);
}

export async function auditSecurity(action, { tenantId = null, userId = null, metadata = {} } = {}) {
  return insertRow('audit_log', {
    id: publicId('audit'), tenant_id: tenantId, user_id: userId, action: clean(action, 120),
    metadata: { version: APP_VERSION, security_event: true, ...metadata }
  }).catch(() => null);
}

export function securityErrorResponseHeaders(error) {
  return error?.retryAfter ? { 'retry-after': String(Math.max(1, Number(error.retryAfter || 60))) } : {};
}
