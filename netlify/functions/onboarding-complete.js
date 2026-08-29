import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';
import { assertBrowserAction } from './_security.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verified customer session required.' });
  const session = validation.session;
  try { assertBrowserAction(event, { session, kind: 'customer', csrf: true }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }

  const body = parseBody(event);
  if (String(body.stage || '') !== 'vault_created') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown onboarding completion stage.' });

  try {
    const userRows = await selectRows('users', `select=id,tenant_id,onboarding_status,onboarding_completed_at&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
    const user = userRows?.[0];
    if (!user?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Onboarding account could not be found.' });
    const now = user.onboarding_completed_at || new Date().toISOString();
    await updateRow('users', `id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}`, {
      status: 'active',
      onboarding_status: 'onboarding_complete',
      last_onboarding_step: 'vault_created',
      onboarding_completed_at: now,
      updated_at: new Date().toISOString()
    });
    await updateRow('tenants', `id=${eq(session.tenantId)}`, { onboarding_completed_at: now, updated_at: new Date().toISOString() }).catch(() => null);
    await insertRow('audit_log', {
      id: publicId('audit'), tenant_id: session.tenantId, user_id: session.userId,
      action: 'production_onboarding_vault_created',
      metadata: { version: APP_VERSION, stage: 'vault_created' }
    }).catch(() => null);
    return jsonResponse(200, { ok: true, version: APP_VERSION, onboardingCompleted: true, onboardingCompletedAt: now });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, code: 'ONBOARDING_COMPLETE_FAILED', message: 'The vault was created, but account setup status could not be finalised yet. Password-Encrypt will retry.', error: error.message || '' });
  }
}
