import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows } from './_db.js';
import { createHash, randomInt } from 'node:crypto';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function cleanDigits(value) { return String(value || '').replace(/\D/g, ''); }
function normaliseCountryCode(value) { const digits = cleanDigits(value); return digits ? `+${digits}` : ''; }
function normaliseLocalPhone(value) { return cleanDigits(value).replace(/^0+/, ''); }
function buildPhoneE164(countryCode, phoneNumber) { const code = normaliseCountryCode(countryCode); const local = normaliseLocalPhone(phoneNumber); return code && local ? `${code}${local}` : ''; }
function maskPhone(value) { const phone = String(value || '').trim(); return phone.length <= 6 ? `${phone.slice(0, 2)}***` : `${phone.slice(0, 4)}***${phone.slice(-3)}`; }
function hashOtp(challengeId, code) { const secret = process.env.OTP_TEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-test-otp-foundation'; return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex'); }

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const testMode = process.env.OTP_TEST_MODE === 'true' || process.env.CONTEXT === 'dev';
  if (!testMode) return jsonResponse(501, { ok: false, version: APP_VERSION, message: 'SMS verification is not active yet. Please use email verification.' });

  const body = parseBody(event);
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || body.countryCode || '+254');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || body.mobile || '');
  const phoneE164 = String(body.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)).trim();
  if (!phoneE164) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter your mobile number before requesting a test code.' });

  try {
    const rows = await selectRows('users', `select=id,tenant_id,phone_e164&phone_e164=${eq(phoneE164)}&limit=1`);
    const user = rows?.[0];
    if (!user?.id || !user?.tenant_id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'No account was found for that mobile number.' });
    const challengeId = publicId('otp');
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await insertRow('otp_challenges', {
      id: challengeId,
      tenant_id: user.tenant_id,
      user_id: user.id,
      purpose: 'sms_development_test',
      delivery_channel: 'sms_test',
      destination: phoneE164,
      destination_masked: maskPhone(phoneE164),
      otp_hash: hashOtp(challengeId, code),
      status: 'pending_sms_test',
      attempts: 0,
      expires_at: expiresAt,
      metadata: { version: APP_VERSION, test_mode: true, no_sms_sent: true }
    });
    return jsonResponse(200, { ok: true, version: APP_VERSION, testMode: true, challengeId, deliveryChannel: 'sms_test', destinationMasked: maskPhone(phoneE164), expiresAt, testOtpCode: code, message: 'Development test code created. No SMS was sent.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not create the test code.', error: error.message, details: error.details || null });
  }
}
