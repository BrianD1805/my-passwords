import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { readCustomerSession } from './_auth.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normaliseCountryCode(value) {
  const digits = cleanDigits(value);
  return digits ? `+${digits}` : '';
}

function normaliseLocalPhone(value) {
  return cleanDigits(value).replace(/^0+/, '');
}

function buildPhoneE164(countryCode, phoneNumber) {
  const code = normaliseCountryCode(countryCode);
  const local = normaliseLocalPhone(phoneNumber);
  return code && local ? `${code}${local}` : '';
}

export async function handler(event) {
  const session = readCustomerSession(event);
  if (!session?.tenantId || !session?.userId) {
    return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'SESSION_REQUIRED', message: 'Verify your account to update these details.' });
  }

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
  const email = String(body.email || '').trim().toLowerCase();
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || '');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || '');
  const phoneE164 = buildPhoneE164(phoneCountryCode, phoneNumber);

  if (!displayName || !accountName || !phoneE164) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Display name, account name and mobile number are required.' });
  if (email && !email.includes('@')) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter a valid email address.' });

  try {
    const emailMatches = email ? await selectRows('users', `select=id&email=${eq(email)}&id=neq.${encodeURIComponent(session.userId)}&limit=1`) : [];
    if (emailMatches?.[0]) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That email address is already linked to another account.' });
    const phoneMatches = await selectRows('users', `select=id&phone_e164=${eq(phoneE164)}&id=neq.${encodeURIComponent(session.userId)}&limit=1`);
    if (phoneMatches?.[0]) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That mobile number is already linked to another account.' });

    const currentRows = await selectRows('users', `select=email,phone_e164,email_verified,phone_verified&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
    const currentUser = currentRows?.[0] || {};
    const emailChanged = String(currentUser.email || '').toLowerCase() !== email;
    const phoneChanged = String(currentUser.phone_e164 || '') !== phoneE164;
    if (emailChanged || phoneChanged) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        message: 'Recovery email and mobile changes require a new verification flow. Keep the current verified details for now; display name and account name can be updated.'
      });
    }
    const user = await updateRow('users', `id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}`, {
      display_name: displayName,
      updated_at: new Date().toISOString()
    });
    const tenant = await updateRow('tenants', `id=${eq(session.tenantId)}`, {
      name: accountName,
      account_name: accountName,
      updated_at: new Date().toISOString()
    });
    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: session.tenantId,
      user_id: session.userId,
      action: 'account_profile_updated',
      metadata: { version: APP_VERSION }
    });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      tenantId: session.tenantId,
      userId: session.userId,
      phoneE164,
      email,
      accountName: tenant?.account_name || accountName,
      displayName: user?.display_name || displayName,
      message: 'Account details updated securely. Plan and subscription status remain admin-controlled.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not update the account profile.', error: error.message, details: error.details || null });
  }
}
