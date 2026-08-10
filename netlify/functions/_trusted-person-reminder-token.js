import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function reminderSecret() {
  const production = process.env.CONTEXT === 'production';
  const secret = process.env.CUSTOMER_SESSION_SECRET || (!production ? process.env.SUPABASE_SERVICE_ROLE_KEY || '' : '');
  if (!secret) throw new Error('CUSTOMER_SESSION_SECRET is required for Trusted Person reminder confirmations.');
  return secret;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function sign(encodedPayload) {
  return createHmac('sha256', reminderSecret())
    .update(`trusted-person-reminder:${encodedPayload}`)
    .digest('base64url');
}

export function createTrustedPersonReminderToken(invitationId, issuedAt = Date.now()) {
  const iat = Number(issuedAt || Date.now());
  const payload = {
    v: 1,
    invitationId: String(invitationId || ''),
    iat,
    exp: iat + TOKEN_TTL_MS,
    nonce: randomBytes(18).toString('base64url')
  };
  if (!payload.invitationId) throw new Error('Trusted Person invitation ID is required.');
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { token: `${encoded}.${sign(encoded)}`, payload };
}

export function verifyTrustedPersonReminderToken(token) {
  const [encoded, signature, extra] = String(token || '').trim().split('.');
  if (!encoded || !signature || extra) {
    const error = new Error('This Trusted Person confirmation link is invalid.');
    error.status = 400;
    error.code = 'REMINDER_TOKEN_INVALID';
    throw error;
  }
  if (!safeEqual(signature, sign(encoded))) {
    const error = new Error('This Trusted Person confirmation link could not be verified.');
    error.status = 403;
    error.code = 'REMINDER_TOKEN_REJECTED';
    throw error;
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch {
    const error = new Error('This Trusted Person confirmation link is invalid.');
    error.status = 400;
    error.code = 'REMINDER_TOKEN_INVALID';
    throw error;
  }
  if (payload?.v !== 1 || !payload?.invitationId || !Number.isFinite(Number(payload?.iat)) || !Number.isFinite(Number(payload?.exp))) {
    const error = new Error('This Trusted Person confirmation link is invalid.');
    error.status = 400;
    error.code = 'REMINDER_TOKEN_INVALID';
    throw error;
  }
  if (Number(payload.exp) < Date.now()) {
    const error = new Error('This Trusted Person confirmation link has expired. A newer reminder will be sent automatically when due.');
    error.status = 410;
    error.code = 'REMINDER_TOKEN_EXPIRED';
    throw error;
  }
  return payload;
}
