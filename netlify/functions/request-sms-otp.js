import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows } from './_db.js';
import { createAccountOtp } from './_account-otp.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function cleanDigits(value) { return String(value || '').replace(/\D/g, ''); }
function normaliseCountryCode(value) { const digits = cleanDigits(value); return digits ? `+${digits}` : ''; }
function normaliseLocalPhone(value) { return cleanDigits(value).replace(/^0+/, ''); }
function buildPhoneE164(countryCode, phoneNumber) { const code = normaliseCountryCode(countryCode); const local = normaliseLocalPhone(phoneNumber); return code && local ? `${code}${local}` : ''; }
function safePurpose(value) {
  const purpose = String(value || '').trim();
  if (purpose.includes('production_onboarding')) return 'production_onboarding';
  if (purpose.includes('new_device') || purpose.includes('restore') || purpose.includes('secure_customer')) return 'secure_customer_session';
  return 'secure_customer_session';
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  const body = parseBody(event);
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || body.countryCode || '+254');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || body.mobile || '');
  const phoneE164 = String(body.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)).trim();
  const purpose = safePurpose(body.purpose);
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter a valid mobile number with country code.' });

  try {
    const rows = await selectRows('users', `select=id,tenant_id,phone_e164,status&phone_e164=${eq(phoneE164)}&limit=1`);
    const user = rows?.[0];
    if (!user?.id || !user?.tenant_id || String(user.status || '').toLowerCase() === 'deleted') {
      return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'No available account was found for that mobile number.' });
    }
    const otp = await createAccountOtp({
      tenantId: user.tenant_id,
      userId: user.id,
      purpose,
      channel: 'sms',
      destination: phoneE164,
      metadata: { verification_flow: purpose }
    });
    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      ...otp,
      deliveryChannel: 'sms',
      smsSent: Boolean(otp.delivery?.sent),
      message: otp.delivery?.sent
        ? `SMS code sent to ${otp.destinationMasked}. Enter the code to continue.`
        : 'Local SMS test code created because production SMS delivery is unavailable in development mode.'
    });
  } catch (error) {
    return jsonResponse(error.status || 500, {
      ok: false,
      version: APP_VERSION,
      message: error.message || 'The SMS verification code could not be sent.',
      error: error.status ? undefined : error.message,
      details: error.details || null
    });
  }
}
