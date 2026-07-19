import { createHmac, timingSafeEqual } from 'node:crypto';

const CUSTOMER_COOKIE = 'mp_customer_session';
const ADMIN_COOKIE = 'mp_admin_session';
const CUSTOMER_SESSION_SECONDS = 60 * 60 * 24 * 30;
const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function secretFor(kind) {
  if (kind === 'admin') {
    return process.env.ADMIN_SESSION_SECRET || process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  }
  return process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function sign(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function encodeSession(payload, kind) {
  const secret = secretFor(kind);
  if (!secret) throw new Error(`${kind === 'admin' ? 'ADMIN_SESSION_SECRET' : 'CUSTOMER_SESSION_SECRET'} is not configured.`);
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

function decodeSession(token, kind) {
  try {
    const [encodedPayload, signature] = String(token || '').split('.');
    const secret = secretFor(kind);
    if (!encodedPayload || !signature || !secret) return null;
    const expected = sign(encodedPayload, secret);
    if (!safeEqual(signature, expected)) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!payload?.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) return null;
    if (payload.kind !== kind) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(event) {
  const raw = event?.headers?.cookie || event?.headers?.Cookie || '';
  return String(raw).split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index < 0) return cookies;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function isSecureRequest(event) {
  const forwardedProto = event?.headers?.['x-forwarded-proto'] || event?.headers?.['X-Forwarded-Proto'] || '';
  if (String(forwardedProto).toLowerCase() === 'https') return true;
  return String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').startsWith('https://');
}

function cookieHeader(name, value, event, maxAge) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function clearCookieHeader(name, event) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function issueCustomerSession(event, { tenantId, userId, role = 'member' }) {
  const now = Math.floor(Date.now() / 1000);
  const token = encodeSession({
    kind: 'customer',
    tenantId,
    userId,
    role,
    iat: now,
    exp: now + CUSTOMER_SESSION_SECONDS
  }, 'customer');
  return cookieHeader(CUSTOMER_COOKIE, token, event, CUSTOMER_SESSION_SECONDS);
}

export function readCustomerSession(event) {
  return decodeSession(parseCookies(event)[CUSTOMER_COOKIE], 'customer');
}

export function clearCustomerSession(event) {
  return clearCookieHeader(CUSTOMER_COOKIE, event);
}

export function issueAdminSession(event) {
  const now = Math.floor(Date.now() / 1000);
  const token = encodeSession({ kind: 'admin', role: 'owner_admin', iat: now, exp: now + ADMIN_SESSION_SECONDS }, 'admin');
  return cookieHeader(ADMIN_COOKIE, token, event, ADMIN_SESSION_SECONDS);
}

export function readAdminSession(event) {
  return decodeSession(parseCookies(event)[ADMIN_COOKIE], 'admin');
}

export function clearAdminSession(event) {
  return clearCookieHeader(ADMIN_COOKIE, event);
}

export function constantTimeSecretMatch(submitted, expected) {
  const submittedHash = createHmac('sha256', 'my-passwords-admin-access').update(String(submitted || '')).digest();
  const expectedHash = createHmac('sha256', 'my-passwords-admin-access').update(String(expected || '')).digest();
  return expectedHash.length === submittedHash.length && timingSafeEqual(submittedHash, expectedHash);
}
