import { createHash, randomInt } from 'node:crypto';
import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';
import { checkSmsVerification, smsProviderMode, startSmsVerification } from './_sms.js';

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
  const secret = process.env.OTP_TEST_SECRET || process.env.CUSTOMER_SESSION_SECRET || (process.env.CONTEXT !== 'production' ? (process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-otp-dev') : '');
  if (!secret) throw new Error('CUSTOMER_SESSION_SECRET is required for production OTP security.');
  return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex');
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function emailCopy(purpose) {
  const map = {
    change_email: ['Confirm your new My Passwords email', 'Confirm your new email address', 'Use this code to verify your new recovery email address.'],
    change_phone: ['Confirm your My Passwords mobile change', 'Confirm your mobile number change', 'Use this code to confirm the mobile number change on your My Passwords account.'],
    account_recovery: ['Recover your My Passwords account access', 'Recover account access', 'Use this code to restore access to your account and subscription on this device.'],
    account_deletion: ['Confirm your My Passwords deletion request', 'Confirm account deletion request', 'Use this code to schedule account deletion after the safety waiting period.'],
    production_onboarding: ['Verify your new My Passwords account', 'Verify your My Passwords account', 'Use this code to verify your account and activate your selected trial.'],
    secure_customer_session: ['Verify this My Passwords device', 'Verify this device', 'Use this code to verify this device for secure backup and syncing.']
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
  return { sent: true, provider: 'resend', providerId: data?.id || '', providerStatus: 'sent', managedCode: false };
}

async function rateLimited(userId, purpose, destination) {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [recent, daily] = await Promise.all([
    selectRows('otp_challenges', `select=id&user_id=${eq(userId)}&purpose=${eq(purpose)}&created_at=${gte(fifteenMinutesAgo)}&limit=4`).catch(() => []),
    selectRows('otp_challenges', `select=id&destination=${eq(destination)}&created_at=${gte(dayAgo)}&limit=11`).catch(() => [])
  ]);
  return (recent || []).length >= 3 || (daily || []).length >= 10;
}

async function recordSmsDelivery({ tenantId, userId, challengeId, purpose, destinationMasked, delivery }) {
  if (!delivery || delivery.provider === 'resend' || delivery.provider === 'local_test') return;
  const now = new Date().toISOString();
  await insertRow('sms_delivery_log', {
    id: publicId('smslog'),
    tenant_id: tenantId,
    user_id: userId,
    challenge_id: challengeId,
    provider: delivery.provider || 'twilio',
    provider_reference: delivery.providerId || null,
    purpose,
    destination_masked: destinationMasked,
    status: delivery.sent ? (delivery.providerStatus || 'sent') : 'failed',
    error_code: delivery.providerCode || null,
    error_message: delivery.reason || null,
    sent_at: delivery.sent ? now : null,
    failed_at: delivery.sent ? null : now,
    metadata: { version: APP_VERSION, provider_mode: delivery.providerMode || smsProviderMode(), managed_code: Boolean(delivery.managedCode) }
  }).catch(() => null);
}

async function updateSmsDelivery(challengeId, patch) {
  await updateRow('sms_delivery_log', `challenge_id=${eq(challengeId)}`, { ...patch, updated_at: new Date().toISOString() }).catch(() => null);
}

export async function createAccountOtp({ tenantId, userId, purpose, channel, destination, metadata = {} }) {
  if (await rateLimited(userId, purpose, destination)) {
    const error = new Error('Too many codes were requested. Wait 15 minutes before trying again.');
    error.status = 429;
    throw error;
  }

  const challengeId = publicId(channel === 'sms' ? 'otpsms' : 'otpaccount');
  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const productionContext = process.env.CONTEXT === 'production';
  const forceSmsTestMode = !productionContext && channel === 'sms' && process.env.SMS_TEST_MODE === 'true';
  const testMode = !productionContext && (forceSmsTestMode || process.env.OTP_TEST_MODE === 'true' || process.env.CONTEXT === 'dev');
  let delivery;

  try {
    delivery = forceSmsTestMode
      ? { sent: false, provider: 'local_test', providerMode: 'local_test', reason: 'SMS test mode is enabled.' }
      : channel === 'sms'
        ? await startSmsVerification({ to: destination, code, purpose })
        : await sendEmail({ to: destination, code, purpose });
  } catch (error) {
    delivery = {
      sent: false,
      provider: channel === 'sms' ? 'twilio' : 'resend',
      providerMode: channel === 'sms' ? smsProviderMode() : 'resend',
      reason: error.message || 'The verification code could not be sent.',
      providerCode: error.providerCode || '',
      details: error.details || null
    };
  }

  const masked = channel === 'sms' ? maskPhone(destination) : maskEmail(destination);
  if (!delivery.sent && !testMode) {
    if (channel === 'sms') await recordSmsDelivery({ tenantId, userId, challengeId: null, purpose, destinationMasked: masked, delivery });
    const error = new Error(delivery.reason || 'The verification code could not be sent.');
    error.status = 503;
    error.details = delivery.details || null;
    throw error;
  }

  const providerManagedCode = channel === 'sms' && delivery.provider === 'twilio_verify' && delivery.managedCode;
  const status = delivery.sent ? `pending_${channel}` : `pending_${channel}_test`;
  await insertRow('otp_challenges', {
    id: challengeId,
    tenant_id: tenantId,
    user_id: userId,
    purpose,
    delivery_channel: channel === 'sms' ? 'sms' : 'email',
    destination,
    destination_masked: masked,
    otp_hash: providerManagedCode ? hashOtp(challengeId, `provider:${delivery.providerId || challengeId}`) : hashOtp(challengeId, code),
    status,
    attempts: 0,
    expires_at: expiresAt,
    metadata: {
      version: APP_VERSION,
      ...metadata,
      provider: delivery.provider,
      provider_mode: delivery.providerMode || null,
      provider_id: delivery.providerId || null,
      provider_status: delivery.providerStatus || null,
      managed_code: providerManagedCode,
      delivery_reason: delivery.reason || null
    }
  });
  await recordSmsDelivery({ tenantId, userId, challengeId, purpose, destinationMasked: masked, delivery });

  return {
    challengeId,
    expiresAt,
    destinationMasked: masked,
    delivery,
    testMode,
    provider: delivery.provider || '',
    providerMode: delivery.providerMode || '',
    testOtpCode: !delivery.sent && testMode ? code : ''
  };
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
    await updateSmsDelivery(challengeId, { status: 'expired' });
    const error = new Error('This verification code has expired. Request another code.'); error.status = 410; throw error;
  }

  const attempts = Number(challenge.attempts || 0) + 1;
  const metadata = parseMetadata(challenge.metadata);
  const providerManagedCode = challenge.delivery_channel === 'sms' && metadata.provider === 'twilio_verify' && metadata.managed_code;
  let approved = false;

  if (providerManagedCode) {
    try {
      const check = await checkSmsVerification({ providerId: metadata.provider_id || '', to: challenge.destination, code });
      approved = check.approved;
      if (!approved) await updateSmsDelivery(challengeId, { status: check.status || 'pending' });
    } catch (error) {
      const locked = attempts >= 5;
      await updateRow('otp_challenges', `id=${eq(challengeId)}`, {
        attempts,
        status: locked ? 'failed_too_many_attempts' : challenge.status,
        updated_at: new Date().toISOString()
      });
      await updateSmsDelivery(challengeId, { status: locked ? 'failed' : 'pending', error_code: error.providerCode || null, error_message: error.message || null, failed_at: locked ? new Date().toISOString() : null });
      const wrapped = new Error(error.status === 404 ? 'This code has expired or has already been used. Request another code.' : (error.message || 'The SMS code could not be checked.'));
      wrapped.status = error.status === 404 ? 410 : (error.status || 503);
      wrapped.details = error.details || null;
      throw wrapped;
    }
  } else {
    approved = hashOtp(challengeId, String(code || '').replace(/\D/g, '')) === challenge.otp_hash;
  }

  if (!approved) {
    const locked = attempts >= 5;
    await updateRow('otp_challenges', `id=${eq(challengeId)}`, { attempts, status: locked ? 'failed_too_many_attempts' : challenge.status, updated_at: new Date().toISOString() });
    if (challenge.delivery_channel === 'sms') await updateSmsDelivery(challengeId, { status: locked ? 'failed' : 'pending', error_message: locked ? 'Too many incorrect attempts.' : null, failed_at: locked ? new Date().toISOString() : null });
    const error = new Error(locked ? 'Too many incorrect attempts. Request another code.' : 'Verification code did not match.'); error.status = 401; throw error;
  }

  const now = new Date().toISOString();
  const verifiedStatus = challenge.delivery_channel === 'sms' ? 'verified_sms' : 'verified_email';
  await updateRow('otp_challenges', `id=${eq(challengeId)}`, { attempts, status: verifiedStatus, verified_at: now, updated_at: now });
  if (challenge.delivery_channel === 'sms') await updateSmsDelivery(challengeId, { status: 'approved', delivered_at: now });
  return { ...challenge, status: verifiedStatus, verified_at: now, attempts };
}
