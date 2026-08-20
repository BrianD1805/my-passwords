import { Buffer } from 'node:buffer';

function safeText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function basicAuthHeader(accountSid, authToken) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
}

function twilioCredentials() {
  return {
    accountSid: safeText(process.env.TWILIO_ACCOUNT_SID, 80),
    authToken: safeText(process.env.TWILIO_AUTH_TOKEN, 180),
    verifyServiceSid: safeText(process.env.TWILIO_VERIFY_SERVICE_SID, 80),
    verifyTemplateSid: safeText(process.env.TWILIO_VERIFY_TEMPLATE_SID, 80),
    messagingServiceSid: safeText(process.env.TWILIO_MESSAGING_SERVICE_SID, 80),
    fromNumber: safeText(process.env.TWILIO_FROM_NUMBER, 40),
    locale: safeText(process.env.TWILIO_VERIFY_LOCALE || 'en', 12) || 'en'
  };
}

export function smsProviderMode() {
  const config = twilioCredentials();
  if (config.accountSid && config.authToken && config.verifyServiceSid) return 'twilio_verify';
  if (config.accountSid && config.authToken && (config.messagingServiceSid || config.fromNumber)) return 'twilio_messaging';
  return 'unconfigured';
}

function smsCopy(purpose, code) {
  const label = purpose === 'account_recovery' ? 'recovery code' : 'verification code';
  const base = `Password-Encrypt ${label}: ${code}. Expires in 10 minutes. Never share this code.`;
  return purpose === 'production_onboarding'
    ? `${base}\n@password-encrypt.com #${code}`
    : base;
}

async function twilioRequest(url, params) {
  const config = twilioCredentials();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: basicAuthHeader(config.accountSid, config.authToken),
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `Twilio returned HTTP ${response.status}.`);
    error.status = response.status >= 500 ? 503 : response.status;
    error.providerCode = data?.code ? String(data.code) : '';
    error.details = data;
    throw error;
  }
  return data;
}

export async function startSmsVerification({ to, purpose, code }) {
  const config = twilioCredentials();
  const mode = smsProviderMode();
  if (mode === 'unconfigured') {
    return { sent: false, provider: 'twilio', providerMode: mode, reason: 'SMS delivery is not configured.' };
  }

  if (mode === 'twilio_verify') {
    const params = { To: to, Channel: 'sms', Locale: config.locale };
    // Optional custom Verify template. A domain-bound template can improve WebOTP
    // pickup on supporting browsers while the normal Twilio Verify flow remains
    // fully functional when this variable is not configured.
    if (config.verifyTemplateSid) params.TemplateSid = config.verifyTemplateSid;
    const data = await twilioRequest(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.verifyServiceSid)}/Verifications`,
      params
    );
    return {
      sent: true,
      provider: 'twilio_verify',
      providerMode: mode,
      providerId: data?.sid || '',
      providerStatus: data?.status || 'pending',
      managedCode: true,
      to: data?.to || to
    };
  }

  const params = {
    To: to,
    Body: smsCopy(purpose, code)
  };
  if (config.messagingServiceSid) params.MessagingServiceSid = config.messagingServiceSid;
  else params.From = config.fromNumber;
  const data = await twilioRequest(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    params
  );
  return {
    sent: true,
    provider: 'twilio_messaging',
    providerMode: mode,
    providerId: data?.sid || '',
    providerStatus: data?.status || 'queued',
    managedCode: false,
    to: data?.to || to
  };
}

export async function checkSmsVerification({ providerId, to, code }) {
  const config = twilioCredentials();
  if (!config.accountSid || !config.authToken || !config.verifyServiceSid) {
    const error = new Error('Twilio Verify is not configured for this verification challenge.');
    error.status = 503;
    throw error;
  }
  const params = { Code: String(code || '').trim() };
  if (providerId) params.VerificationSid = providerId;
  else params.To = to;
  const data = await twilioRequest(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(config.verifyServiceSid)}/VerificationCheck`,
    params
  );
  return {
    approved: data?.status === 'approved' || Boolean(data?.valid),
    status: data?.status || '',
    valid: Boolean(data?.valid),
    providerId: data?.sid || providerId || ''
  };
}
