import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';
import { assertBrowserAction } from './_security.js';

const CURRENT_TOUR_VERSION = 1;
const ALLOWED_STATUSES = new Set(['not_started', 'later', 'skipped', 'completed']);

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  }

  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) {
    return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verify this device to continue.' });
  }
  const session = validation.session;

  if (event.httpMethod === 'GET') {
    try {
      const rows = await selectRows('users', `select=guided_tour_status,guided_tour_version,guided_tour_updated_at&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
      const user = rows?.[0] || {};
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        status: String(user.guided_tour_status || ''),
        tourVersion: Number(user.guided_tour_version || CURRENT_TOUR_VERSION),
        updatedAt: user.guided_tour_updated_at || ''
      });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load guided tour status.', error: error.message, details: error.details || null });
    }
  }

  try {
    assertBrowserAction(event, { session, kind: 'customer', csrf: true });
  } catch (error) {
    return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message });
  }

  const body = parseBody(event);
  const status = String(body.status || '').trim().toLowerCase();
  const tourVersion = Math.max(1, Math.min(1000, Number(body.tourVersion || CURRENT_TOUR_VERSION)));
  if (!ALLOWED_STATUSES.has(status)) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown guided tour status.' });
  }

  try {
    const now = new Date().toISOString();
    await updateRow('users', `id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}`, {
      guided_tour_status: status,
      guided_tour_version: tourVersion,
      guided_tour_updated_at: now,
      updated_at: now
    });
    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: session.tenantId,
      user_id: session.userId,
      action: 'guided_tour_status_updated',
      metadata: { version: APP_VERSION, guided_tour_status: status, guided_tour_version: tourVersion }
    }).catch(() => null);
    return jsonResponse(200, { ok: true, version: APP_VERSION, status, tourVersion, updatedAt: now });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not save guided tour status.', error: error.message, details: error.details || null });
  }
}
