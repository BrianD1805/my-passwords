import { APP_VERSION, jsonResponse, parseBody, selectRows } from './_db.js';
import { clearCustomerSession, issueCustomerSession, readCustomerSession } from './_auth.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  if (event.httpMethod === 'POST') {
    const action = String(parseBody(event).action || '').trim();
    if (action === 'logout') {
      return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, message: 'Secure account session ended.' }, {
        'set-cookie': clearCustomerSession(event)
      });
    }
  }

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  }

  const session = readCustomerSession(event);
  if (!session?.tenantId || !session?.userId) {
    return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, message: 'Verify your account to establish a secure session on this device.' });
  }

  try {
    const users = await selectRows('users', `select=id,tenant_id,display_name,email,phone_e164,role,status,email_verified,phone_verified&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
    const tenants = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role&id=${eq(session.tenantId)}&limit=1`);
    const user = users?.[0];
    const tenant = tenants?.[0];
    const active = Boolean(user?.id && tenant?.id && user.status !== 'suspended' && tenant.account_status !== 'suspended');
    if (!active) {
      return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, message: 'This account session is no longer active.' }, {
        'set-cookie': clearCustomerSession(event)
      });
    }

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      authenticated: true,
      tenantId: tenant.id,
      userId: user.id,
      role: user.role || session.role || 'member',
      account: {
        displayName: user.display_name || '',
        email: user.email || '',
        phoneE164: user.phone_e164 || '',
        accountName: tenant.account_name || tenant.name || '',
        planCode: tenant.plan_code || 'personal_free',
        planStatus: tenant.plan_status || 'trial_pending',
        accountStatus: tenant.account_status || 'active',
        tenantRole: tenant.tenant_role || 'primary_owner'
      },
      message: 'Secure account session is active.'
    }, {
      'set-cookie': issueCustomerSession(event, { tenantId: tenant.id, userId: user.id, role: user.role || session.role || 'member' })
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, authenticated: false, message: 'Could not validate the secure account session.', error: error.message, details: error.details || null });
  }
}
