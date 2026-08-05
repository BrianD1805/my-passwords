import { createHash, randomInt } from 'node:crypto';
import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function gte(value) { return `gte.${encodeURIComponent(value)}`; }

export function maskEmail(value) {
  const email = String(value || '').trim();
  if (!email.includes('@')) return '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, Math.min(2, name.length)) || '*'}***${name.length > 2 ? name.slice(-1) : ''}@${domain}`;
}

export function maskPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return '';
  return phone.length <= 7 ? `${phone.slice(0, 3)}***` : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

export function hashOtp(challengeId, code) {
  const secret = process.env.OTP_TEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-account-otp';
  return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex');
}

function emailCopy(purpose) {
  const map = {
    change_email: ['Confirm your new My Passwords email', 'Confirm your new email address', 'Use this code to verify your new recovery email address.'],
    change_phone: ['Confirm your My Passwords mobile change', 'Confirm your mobile number change', 'Use this code to confirm the mobile number change on your My Passwords account.'],
    account_recovery: ['Recover your My Passwords account access', 'Recover account access', 'Use this code to restore access to your account and subscription on this device.'],
    account_deletion: ['Confirm your My Passwords deletion request', 'Confirm account deletion request', 'Use this code to schedule account deletion after the safety waiting period.']
  };
  return map[purpose] || ['Your My Passwords verification code', 'My Passwords verification', 'Use this code to verify your account action.'];
}

async function sendEmail({ to, code, purpose }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) return { sent: false, provider: 'resend', reason: 'Email delivery is not configured.' };
  const [subject, heading, intro] = emailCopy(purpose);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject,
      html: `<!doctype html><html><body style="margin:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:540px;margin:auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:28px"><h1 style="margin:0 0 12px;color:#14263b;font-size:25px">${heading}</h1><p style="line-height:1.6;color:#536579">${intro}</p><div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#1d3557;background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:18px;text-align:center">${code}</div><p style="line-height:1.55;color:#536579">This code expires in 10 minutes.</p><p style="font-size:13px;color:#7b8fa3">Account recovery never reveals or resets your master password. Without the correct master password, an encrypted vault cannot be decrypted.</p></div></div></body></html>`,
      text: `${intro} Your code is ${code}. It expires in 10 minutes. Account recovery cannot recover your master password.`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
  return { sent: true, provider: 'resend', providerId: data?.id || '' };
}

async function sendSms({ to, code, purpose }) {
  const sid = process.env.TWILIO_ACCOUNT_SID || '';
  const token = process.env.TWILIO_AUTH_TOKEN || '';
  const from = process.env.TWILIO_FROM_NUMBER || '';
  if (!sid || !token || !from) return { sent: false, provider: 'twilio', reason: 'SMS delivery is not configured.' };
  const copy = purpose === 'account_recovery' ? 'My Passwords recovery code' : 'My Passwords verification code';
  const body = new URLSearchParams({ To: to, From: from, Body: `${copy}: ${code}. Expires in 10 minutes. Your master password cannot be recovered.` });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, provider: 'twilio', reason: data?.message || `Twilio returned HTTP ${response.status}.`, details: data };
  return { sent: true, provider: 'twilio', providerId: data?.sid || '' };
}

async function rateLimited(userId, purpose) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const rows = await selectRows('otp_challenges', `select=id&user_id=${eq(userId)}&purpose=${eq(purpose)}&created_at=${gte(since)}&limit=4`).catch(() => []);
  return (rows || []).length >= 3;
}

export async function createAccountOtp({ tenantId, userId, purpose, channel, destination, metadata = {} }) {
  if (await rateLimited(userId, purpose)) {
    const error = new Error('Too many codes were requested. Wait 15 minutes before trying again.');
    error.status = 429;
    throw error;
  }
  const challengeId = publicId('otpaccount');
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const testMode = process.env.OTP_TEST_MODE === 'true' || process.env.CONTEXT === 'dev';
  const delivery = channel === 'sms'
    ? await sendSms({ to: destination, code, purpose })
    : await sendEmail({ to: destination, code, purpose });
  if (!delivery.sent && !testMode) {
    const error = new Error(delivery.reason || 'The verification code could not be sent.');
    error.status = 503;
    throw error;
  }
  const masked = channel === 'sms' ? maskPhone(destination) : maskEmail(destination);
  await insertRow('otp_challenges', {
    id: challengeId,
    tenant_id: tenantId,
    user_id: userId,
    purpose,
    delivery_channel: channel === 'sms' ? 'sms' : 'email',
    destination,
    destination_masked: masked,
    otp_hash: hashOtp(challengeId, code),
    status: delivery.sent ? `pending_${channel}` : `pending_${channel}_test`,
    attempts: 0,
    expires_at: expiresAt,
    metadata: { version: APP_VERSION, ...metadata, provider: delivery.provider, provider_id: delivery.providerId || null, delivery_reason: delivery.reason || null }
  });
  return { challengeId, expiresAt, destinationMasked: masked, delivery, testMode, testOtpCode: !delivery.sent && testMode ? code : '' };
}

export async function verifyAccountOtp({ challengeId, code, purpose, tenantId = '', userId = '' }) {
  const rows = await selectRows('otp_challenges', `select=*&id=${eq(challengeId)}&limit=1`);
  const challenge = rows?.[0];
  if (!challenge) { const error = new Error('Verification challenge was not found.'); error.status = 404; throw error; }
  if (purpose && challenge.purpose !== purpose) { const error = new Error('This verification code is for a different action.'); error.status = 409; throw error; }
  if (tenantId && challenge.tenant_id !== tenantId) { const error = new Error('This verification code is not linked to this account.'); error.status = 403; throw error; }
  if (userId && challenge.user_id !== userId) { const error = new Error('This verification code is not linked to this account.'); error.status = 403; throw error; }
  if (!String(challenge.status || '').startsWith('pending')) { const error = new Error('This verification code has already been used.'); error.status = 409; throw error; }
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await updateRow('otp_challenges', `id=${eq(challengeId)}`, { status: 'expired', updated_at: new Date().toISOString() });
    const error = new Error('This verification code has expired. Request another code.'); error.status = 410; throw error;
  }
  const attempts = Number(challenge.attempts || 0) + 1;
  if (hashOtp(challengeId, String(code || '').replace(/\D/g, '')) !== challenge.otp_hash) {
    const locked = attempts >= 5;
    await updateRow('otp_challenges', `id=${eq(challengeId)}`, { attempts, status: locked ? 'failed_too_many_attempts' : challenge.status, updated_at: new Date().toISOString() });
    const error = new Error(locked ? 'Too many incorrect attempts. Request another code.' : 'Verification code did not match.'); error.status = 401; throw error;
  }
  const now = new Date().toISOString();
  await updateRow('otp_challenges', `id=${eq(challengeId)}`, { attempts, status: 'verified', verified_at: now, updated_at: now });
  return challenge;
}
