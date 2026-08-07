import { APP_VERSION, jsonResponse } from './_db.js';
import { smsProviderMode } from './_sms.js';

export async function handler() {
  const smsMode = smsProviderMode();
  return jsonResponse(200, {
    ok: true,
    app: 'My Passwords',
    version: APP_VERSION,
    mode: 'security-hardening',
    sms: {
      configured: smsMode !== 'unconfigured',
      providerMode: smsMode
    },
    email: {
      configured: Boolean(process.env.RESEND_API_KEY && process.env.OTP_EMAIL_FROM),
      provider: 'resend'
    },
    security: {
      customerSessionSecretConfigured: Boolean(process.env.CUSTOMER_SESSION_SECRET),
      adminSessionSecretConfigured: Boolean(process.env.ADMIN_SESSION_SECRET),
      adminAccessKeyConfigured: Boolean(process.env.ADMIN_ACCESS_KEY),
      stripeWebhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET)
    }
  });
}
