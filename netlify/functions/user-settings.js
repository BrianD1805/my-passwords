import { APP_VERSION, insertRow, jsonResponse, parseBody, selectRows, upsertRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';
import { assertBrowserAction } from './_security.js';

const DEFAULTS = Object.freeze({
  secureDeviceUnlockCount: 10,
  neverForcePasswordAgain: false,
  dateFormat: 'dmy-text'
});

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function normaliseSettings(value = {}) {
  const count = Math.min(999, Math.max(1, Number.parseInt(value.secureDeviceUnlockCount ?? value.secure_device_unlock_count, 10) || DEFAULTS.secureDeviceUnlockCount));
  const requestedFormat = String(value.dateFormat ?? value.date_format ?? DEFAULTS.dateFormat);
  const dateFormat = ['dmy-numeric', 'mdy-numeric', 'dmy-text'].includes(requestedFormat) ? requestedFormat : DEFAULTS.dateFormat;
  return {
    secureDeviceUnlockCount: count,
    neverForcePasswordAgain: Boolean(value.neverForcePasswordAgain ?? value.never_force_password_again),
    dateFormat
  };
}

function rowToSettings(row = {}) {
  return normaliseSettings(row);
}

export async function handler(event) {
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) {
    return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verify your account to manage User Settings.' });
  }
  const session = validation.session;

  if (event.httpMethod === 'GET') {
    try {
      const rows = await selectRows('user_settings', `select=tenant_id,user_id,secure_device_unlock_count,never_force_password_again,date_format,updated_at&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&limit=1`);
      return jsonResponse(200, { ok: true, version: APP_VERSION, settings: rowToSettings(rows?.[0] || DEFAULTS), updatedAt: rows?.[0]?.updated_at || '' });
    } catch (error) {
      if (error?.status === 404 || /relation .*user_settings.* does not exist/i.test(String(error?.message || ''))) {
        return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'USER_SETTINGS_TABLE_REQUIRED', message: 'User Settings storage has not been installed yet.' });
      }
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load User Settings.', error: error.message, details: error.details || null });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  try { assertBrowserAction(event, { session, kind: 'customer', csrf: true }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }

  const settings = normaliseSettings(parseBody(event));
  const now = new Date().toISOString();
  try {
    const saved = await upsertRow('user_settings', {
      tenant_id: session.tenantId,
      user_id: session.userId,
      secure_device_unlock_count: settings.secureDeviceUnlockCount,
      never_force_password_again: settings.neverForcePasswordAgain,
      date_format: settings.dateFormat,
      updated_at: now
    }, 'tenant_id,user_id');
    await insertRow('audit_log', {
      id: `audit_${crypto.randomUUID()}`,
      tenant_id: session.tenantId,
      user_id: session.userId,
      action: 'user_settings_updated',
      metadata: {
        version: APP_VERSION,
        secure_device_unlock_count: settings.secureDeviceUnlockCount,
        never_force_password_again: settings.neverForcePasswordAgain,
        date_format: settings.dateFormat
      }
    }).catch(() => null);
    return jsonResponse(200, { ok: true, version: APP_VERSION, settings: rowToSettings(saved || settings), updatedAt: saved?.updated_at || now, message: 'User settings saved.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not save User Settings.', error: error.message, details: error.details || null });
  }
}
