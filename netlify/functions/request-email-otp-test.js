import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows } from './_db.js';
import { createHash, randomInt } from 'node:crypto';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function gte(value) { return `gte.${encodeURIComponent(value)}`; }

function maskEmail(value) {
  const email = String(value || '').trim();
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const safeName = name.length <= 2 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
  return `${safeName}@${domain}`;
}

function hashOtp(challengeId, code) {
  const secret = process.env.OTP_TEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-test-otp-foundation';
  return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex');
}

async function findUser(email) {
  if (!email) return null;
  const rows = await selectRows('users', `select=id,tenant_id,email,phone_e164,status&email=${eq(email)}&limit=1`);
  return rows?.[0] || null;
}

async function checkRateLimit(userId) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const rows = await selectRows('otp_challenges', `select=id,created_at&user_id=${eq(userId)}&created_at=${gte(since)}&order=created_at.desc&limit=4`);
  return (rows || []).length >= 3;
}

function buildEmailHtml(code, maskedEmail) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;"><div style="max-width:520px;margin:0 auto;padding:28px 18px;"><div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);"><h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">My Passwords verification code</h1><p style="margin:0 0 18px;line-height:1.55;color:#536579;">Use this one-time code to verify your account and establish a secure session. You will still need your master password to decrypt your vault.</p><div style="font-size:34px;letter-spacing:8px;font-weight:800;color:#1d3557;background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:18px;text-align:center;">${code}</div><p style="margin:18px 0 0;line-height:1.55;color:#536579;">This code expires in 10 minutes. Sent to ${maskedEmail || 'your backup email'}.</p><p style="margin:14px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">If you did not request this, ignore this email. Your master password is never sent by email.</p></div></div></body></html>`;
}

async function sendWithResend({ to, code, maskedEmail }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) return { sent: false, provider: 'resend', reason: 'Email delivery is not configured.' };
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: 'Your My Passwords verification code',
      html: buildEmailHtml(code, maskedEmail),
      text: `Your My Passwords verification code is ${code}. It expires in 10 minutes. Your master password is still required to decrypt the vault.`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
  return { sent: true, provider: 'resend', providerId: data?.id || '' };
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const body = parseBody(event);
  const email = String(body.email || '').trim().toLowerCase();
  const purpose = String(body.purpose || 'secure_customer_session').trim();
  const testMode = process.env.OTP_TEST_MODE === 'true' || process.env.CONTEXT === 'dev';

  if (!email || !email.includes('@')) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter a valid backup email before requesting an email OTP.' });

  try {
    const user = await findUser(email);
    if (!user?.id || !user?.tenant_id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'No account was found for that email. Create the account first or check the address.' });
    if (await checkRateLimit(user.id)) return jsonResponse(429, { ok: false, version: APP_VERSION, message: 'Too many codes were requested. Wait 15 minutes before trying again.' });

    const challengeId = publicId('otpemail');
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const destinationMasked = maskEmail(email);
    const delivery = await sendWithResend({ to: email, code, maskedEmail: destinationMasked });

    await insertRow('otp_challenges', {
      id: challengeId,
      tenant_id: user.tenant_id,
      user_id: user.id,
      purpose,
      delivery_channel: 'email',
      destination: email,
      destination_masked: destinationMasked,
      otp_hash: hashOtp(challengeId, code),
      status: delivery.sent ? 'pending_email' : 'pending_email_delivery_failed',
      attempts: 0,
      expires_at: expiresAt,
      metadata: { version: APP_VERSION, email_sent: delivery.sent, provider: delivery.provider, provider_id: delivery.providerId || null, delivery_reason: delivery.reason || null }
    });

    if (!delivery.sent && !testMode) return jsonResponse(503, { ok: false, version: APP_VERSION, message: 'The verification email could not be sent. Please try again later.' });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      testMode,
      challengeId,
      deliveryChannel: 'email',
      destinationMasked,
      expiresAt,
      emailSent: delivery.sent,
      provider: delivery.provider,
      providerId: delivery.providerId || '',
      testOtpCode: !delivery.sent && testMode ? code : '',
      message: delivery.sent ? `Email code sent to ${destinationMasked}. Enter the code to continue.` : 'Local test code created because email delivery is unavailable in development mode.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not create the email OTP challenge.', error: error.message, details: error.details || null });
  }
}
