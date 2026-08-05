import { APP_VERSION, jsonResponse } from './_db.js';
import { smsProviderMode } from './_sms.js';

export async function handler() {
  const smsMode = smsProviderMode();
  return jsonResponse(200, {
    ok: true,
    app: 'My Passwords',
    version: APP_VERSION,
    mode: 'production-sms-integration',
    sms: {
      configured: smsMode !== 'unconfigured',
      providerMode: smsMode
    }
  });
}
