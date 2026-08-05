import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) {
    return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verify your account to update these details.' });
  }
  const session = validation.session;

  if (event.httpMethod === 'GET') {
    try {
      const users = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_country_code,phone_number,phone_e164,email_verified,phone_verified&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
      const tenants = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role&id=${eq(session.tenantId)}&limit=1`);
      if (!users?.[0] || !tenants?.[0]) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Account profile was not found.' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, user: users[0], tenant: tenants[0] });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load the account profile.', error: error.message, details: error.details || null });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });

  const body = parseBody(event);
  const displayName = String(body.displayName || '').trim();
  const accountName = String(body.accountName || '').trim();
  if (!displayName || !accountName) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Display name and account name are required.' });

  try {
    const currentRows = await selectRows('users', `select=email,phone_country_code,phone_number,phone_e164,email_verified,phone_verified&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
    const currentUser = currentRows?.[0];
    if (!currentUser) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Account profile was not found.' });

    const now = new Date().toISOString();
    const user = await updateRow('users', `id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}`, {
      display_name: displayName,
      updated_at: now
    });
    const tenant = await updateRow('tenants', `id=${eq(session.tenantId)}`, {
      name: accountName,
      account_name: accountName,
      updated_at: now
    });
    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: session.tenantId,
      user_id: session.userId,
      action: 'account_profile_updated',
      metadata: { version: APP_VERSION, fields: ['display_name', 'account_name'] }
    });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      tenantId: session.tenantId,
      userId: session.userId,
      phoneCountryCode: currentUser.phone_country_code || '',
      phoneNumber: currentUser.phone_number || '',
      phoneE164: currentUser.phone_e164 || '',
      phoneVerified: Boolean(currentUser.phone_verified),
      email: currentUser.email || '',
      emailVerified: Boolean(currentUser.email_verified),
      accountName: tenant?.account_name || accountName,
      displayName: user?.display_name || displayName,
      message: 'Account names updated. Verified email and mobile details remain unchanged.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not update the account profile.', error: error.message, details: error.details || null });
  }
}
