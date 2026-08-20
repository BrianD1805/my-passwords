import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows } from './_db.js';
import { createAccountOtp } from './_account-otp.js';
import { assertBrowserAction, consumeRateLimit, requestIpHash, securityErrorResponseHeaders } from './_security.js';

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
  try { assertBrowserAction(event, { csrf: false }); } catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || body.countryCode || '+254');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || body.mobile || '');
  const phoneE164 = String(body.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)).trim();
  const purpose = safePurpose(body.purpose);
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter a valid mobile number with country code.' });

  try {
    await consumeRateLimit(event, { scope: 'otp_request_ip', identifier: requestIpHash(event), limit: 8, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    await consumeRateLimit(event, { scope: 'otp_request_destination', identifier: phoneE164, limit: 4, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    const rows = await selectRows('users', `select=id,tenant_id,email,phone_e164,email_verified,phone_verified,status&phone_e164=${eq(phoneE164)}&limit=1`);
    const user = rows?.[0];
    if (!user?.id || !user?.tenant_id || String(user.status || '').toLowerCase() === 'deleted') {
      return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'No available account was found for that mobile number.' });
    }

    if (purpose === 'production_onboarding') {
      // Ver-1.010 makes mobile verification the first onboarding verification step.
      // Keep the paid SMS channel tightly rate-limited, but do not require failed
      // email attempts before a new customer can verify the mobile number.
      await consumeRateLimit(event, {
        scope: 'onboarding_sms_primary',
        identifier: user.id,
        limit: 2,
        windowSeconds: 10 * 60,
        blockSeconds: 20 * 60
      });
    }

    const otp = await createAccountOtp({
      tenantId: user.tenant_id,
      userId: user.id,
      purpose,
      channel: 'sms',
      destination: phoneE164,
      metadata: { verification_flow: purpose, onboarding_primary_sms: purpose === 'production_onboarding', sms_fallback: false }
    });
    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      ...otp,
      deliveryChannel: 'sms',
      smsSent: Boolean(otp.delivery?.sent),
      smsFallback: false,
      onboardingPrimarySms: purpose === 'production_onboarding',
      message: otp.delivery?.sent
        ? (purpose === 'production_onboarding'
            ? `SMS code sent to ${otp.destinationMasked}. Enter the code to verify your mobile number and continue.`
            : `SMS code sent to ${otp.destinationMasked}. Enter the code to continue.`)
        : 'Local SMS test code created because production SMS delivery is unavailable in development mode.'
    });
  } catch (error) {
    return jsonResponse(error.status || 500, {
      ok: false,
      version: APP_VERSION,
      message: error.message || 'The SMS verification code could not be sent.',
      error: error.status ? undefined : error.message,
      details: error.details || null
    }, securityErrorResponseHeaders(error));
  }
}
