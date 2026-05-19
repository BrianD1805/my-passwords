import { APP_VERSION, jsonResponse } from './_db.js';

export async function handler() {
  return jsonResponse(200, {
    ok: true,
    app: 'My Passwords',
    version: APP_VERSION,
    mode: 'account-login-foundation-local-first-vault'
  });
}
