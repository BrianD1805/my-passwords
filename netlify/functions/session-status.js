import { APP_VERSION, jsonResponse, parseBody, selectRows } from './_db.js';
import { clearCustomerSession, issueCustomerSession, readCustomerSession } from './_auth.js';
import { evaluateTenantAccess, loadTenantSubscription, trialDaysRemaining } from './_trial.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  if (event.httpMethod === 'POST') {
    const action = String(parseBody(event).action || '').trim();
    if (action === 'logout') {
      return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, cloudAccess: false, message: 'Device verification ended.' }, {
        'set-cookie': clearCustomerSession(event)
      });
    }
  }

  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  }

  const session = readCustomerSession(event);
  if (!session?.tenantId || !session?.userId) {
    return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, cloudAccess: false, code: 'SESSION_REQUIRED', message: 'Verify this device to enable secure backup and syncing.' });
  }

  try {
    const users = await selectRows('users', `select=id,tenant_id,display_name,email,phone_e164,role,status,email_verified,phone_verified&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
    const tenants = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at&id=${eq(session.tenantId)}&limit=1`);
    const user = users?.[0];
    const tenant = tenants?.[0];
    if (!user?.id || !tenant?.id || String(user.status || '').toLowerCase() === 'suspended') {
      return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, cloudAccess: false, code: 'SESSION_INVALID', message: 'This device verification is no longer active.' }, {
        'set-cookie': clearCustomerSession(event)
      });
    }

    const lifecycle = await evaluateTenantAccess(tenant);
    const subscription = await loadTenantSubscription(tenant.id);
    const trialStartedAt = tenant.trial_started_at || subscription?.trial_started_at || null;
    const trialEndsAt = tenant.trial_ends_at || subscription?.trial_ends_at || null;
    const cloudAccess = Boolean(lifecycle.allowed);

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      authenticated: true,
      cloudAccess,
      accessCode: cloudAccess ? '' : lifecycle.code || 'ACCOUNT_ACCESS_PAUSED',
      tenantId: tenant.id,
      userId: user.id,
      role: user.role || session.role || 'member',
      account: {
        displayName: user.display_name || '',
        email: user.email || '',
        phoneE164: user.phone_e164 || '',
        accountName: tenant.account_name || tenant.name || '',
        planCode: tenant.plan_code || 'personal',
        planStatus: tenant.plan_status || 'trial_pending',
        accountStatus: tenant.account_status || 'active',
        tenantRole: tenant.tenant_role || 'primary_owner',
        trialStartedAt,
        trialEndsAt,
        trialDaysRemaining: trialDaysRemaining(trialEndsAt),
        onboardingCompletedAt: tenant.onboarding_completed_at || null
      },
      message: cloudAccess ? 'This device is verified for secure backup and syncing.' : lifecycle.message
    }, {
      'set-cookie': issueCustomerSession(event, { tenantId: tenant.id, userId: user.id, role: user.role || session.role || 'member' })
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, authenticated: false, cloudAccess: false, message: 'Could not check device verification.', error: error.message, details: error.details || null });
  }
}
