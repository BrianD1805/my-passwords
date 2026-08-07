import { createHmac, timingSafeEqual } from 'node:crypto';

const CUSTOMER_COOKIE = 'mp_customer_session';
const ADMIN_COOKIE = 'mp_admin_session';
const SECURE_CUSTOMER_COOKIE = '__Host-mp_customer_session';
const SECURE_ADMIN_COOKIE = '__Host-mp_admin_session';
const CUSTOMER_SESSION_SECONDS = 60 * 60 * 24 * 30;
const ADMIN_SESSION_SECONDS = 60 * 60 * 8;

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function secretFor(kind) {
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
  if (forwardedProto) return String(forwardedProto).toLowerCase() === 'https';
  const host = String(event?.headers?.host || event?.headers?.Host || '').toLowerCase();
  if (host.startsWith('localhost:') || host.startsWith('127.0.0.1:')) return false;
  return String(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || '').startsWith('https://');
}

function cookieName(kind, event) {
  const secure = isSecureRequest(event);
  if (kind === 'admin') return secure ? SECURE_ADMIN_COOKIE : ADMIN_COOKIE;
  return secure ? SECURE_CUSTOMER_COOKIE : CUSTOMER_COOKIE;
}

function cookieHeader(name, value, event, maxAge) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Priority=High${secure}`;
}

function clearCookieHeader(name, event) {
  const secure = isSecureRequest(event) ? '; Secure' : '';
  return `${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Priority=High${secure}`;
}

export function issueCustomerSession(event, { tenantId, userId, role = 'member', sessionId = '', deviceId = '', sessionGeneration = 1, expiresAt = '' }) {
  const now = Math.floor(Date.now() / 1000);
  const requestedExpiry = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : 0;
  const exp = Number.isFinite(requestedExpiry) && requestedExpiry > now ? requestedExpiry : now + CUSTOMER_SESSION_SECONDS;
  const maxAge = Math.max(0, exp - now);
  const token = encodeSession({
    kind: 'customer',
    tenantId,
    userId,
    role,
    sessionId,
    deviceId,
    sessionGeneration: Number(sessionGeneration || 1),
    iat: now,
    exp
  }, 'customer');
  return cookieHeader(cookieName('customer', event), token, event, maxAge);
}

export function readCustomerSession(event) {
  const cookies = parseCookies(event);
  if (isSecureRequest(event)) return decodeSession(cookies[SECURE_CUSTOMER_COOKIE], 'customer');
  return decodeSession(cookies[CUSTOMER_COOKIE] || cookies[SECURE_CUSTOMER_COOKIE], 'customer');
}

export function clearCustomerSession(event) {
  return clearCookieHeader(cookieName('customer', event), event);
}

export function issueAdminSession(event, { sessionId = '', expiresAt = '' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const requestedExpiry = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : 0;
  const exp = Number.isFinite(requestedExpiry) && requestedExpiry > now ? requestedExpiry : now + ADMIN_SESSION_SECONDS;
  const token = encodeSession({ kind: 'admin', role: 'owner_admin', sessionId, iat: now, exp }, 'admin');
  return cookieHeader(cookieName('admin', event), token, event, Math.max(0, exp - now));
}

export function readAdminSession(event) {
  const cookies = parseCookies(event);
  if (isSecureRequest(event)) return decodeSession(cookies[SECURE_ADMIN_COOKIE], 'admin');
  return decodeSession(cookies[ADMIN_COOKIE] || cookies[SECURE_ADMIN_COOKIE], 'admin');
}

export function clearAdminSession(event) {
  return clearCookieHeader(cookieName('admin', event), event);
}

export function constantTimeSecretMatch(submitted, expected) {
  const submittedHash = createHmac('sha256', 'my-passwords-admin-access').update(String(submitted || '')).digest();
  const expectedHash = createHmac('sha256', 'my-passwords-admin-access').update(String(expected || '')).digest();
  return expectedHash.length === submittedHash.length && timingSafeEqual(submittedHash, expectedHash);
}
