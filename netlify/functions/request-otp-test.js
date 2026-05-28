import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows } from './_db.js';
import { createHash, randomInt } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normaliseCountryCode(value) {
  const digits = cleanDigits(value);
  return digits ? `+${digits}` : '';
}

function normaliseLocalPhone(value) {
  return cleanDigits(value).replace(/^0+/, '');
}

function buildPhoneE164(countryCode, phoneNumber) {
  const code = normaliseCountryCode(countryCode);
  const local = normaliseLocalPhone(phoneNumber);
  return code && local ? `${code}${local}` : '';
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return '';
  return phone.length <= 6 ? `${phone.slice(0, 2)}***` : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

function maskEmail(value) {
  const email = String(value || '').trim();
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

function hashOtp(challengeId, code) {
  const secret = process.env.OTP_TEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-test-otp-foundation';
  return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex');
}

async function findUser(email, phoneE164) {
  if (phoneE164) {
    const byPhone = await selectRows('users', `select=id,tenant_id,email,phone_e164&phone_e164=${eq(phoneE164)}&limit=1`);
    if (byPhone?.[0]) return byPhone[0];
  }
  if (email) {
    const byEmail = await selectRows('users', `select=id,tenant_id,email,phone_e164&email=${eq(email)}&limit=1`);
    if (byEmail?.[0]) return byEmail[0];
  }
  return null;
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  const email = String(body.email || '').trim().toLowerCase();
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || body.countryCode || '+254');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || body.mobile || '');
  const phoneE164 = String(body.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)).trim();
  const purpose = String(body.purpose || 'new_device_restore_test').trim();

  if (!phoneE164 && !email) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter the account phone number or backup email before requesting a test OTP.' });
  }

  try {
    const user = await findUser(email, phoneE164);
    if (!user?.id || !user?.tenant_id) {
      return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Account identity was not found yet. Save the account foundation first, then request a test OTP.' });
    }

    const challengeId = publicId('otp');
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const destination = phoneE164 || email;
    const deliveryChannel = phoneE164 ? 'sms_test' : 'email_test';

    await insertRow('otp_challenges', {
      id: challengeId,
      tenant_id: user.tenant_id,
      user_id: user.id,
      purpose,
      delivery_channel: deliveryChannel,
      destination,
      destination_masked: phoneE164 ? maskPhone(phoneE164) : maskEmail(email),
      otp_hash: hashOtp(challengeId, code),
      status: 'pending_test',
      attempts: 0,
      expires_at: expiresAt,
      metadata: {
        version: APP_VERSION,
        test_mode: true,
        no_sms_sent: true,
        no_email_sent: true,
        note: 'Ver-0.013A returns the OTP in the response so the flow can be tested without lockout risk.'
      }
    });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      testMode: true,
      challengeId,
      deliveryChannel,
      destinationMasked: phoneE164 ? maskPhone(phoneE164) : maskEmail(email),
      expiresAt,
      testOtpCode: code,
      message: 'Test-mode OTP created. No SMS or email was sent. Use the returned code to verify the flow safely.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      version: APP_VERSION,
      message: 'Could not create test-mode OTP challenge.',
      error: error.message,
      details: error.details || null
    });
  }
}
