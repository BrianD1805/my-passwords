import { selectRows } from './_db.js';
import { readCustomerSession } from './_auth.js';
import { evaluateTenantAccess } from './_trial.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function getCustomerAccess(event) {
  const session = readCustomerSession(event);
  if (!session?.tenantId || !session?.userId) {
    return { ok: false, code: 'SESSION_REQUIRED', message: 'Verify this device to use secure cloud features.' };
  }

  const users = await selectRows('users', `select=id,tenant_id,role,status&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
  const tenants = await selectRows('tenants', `select=id,account_status,plan_status,plan_code,tenant_role,trial_started_at,trial_ends_at&id=${eq(session.tenantId)}&limit=1`);
  const user = users?.[0];
  const tenant = tenants?.[0];
  if (!user?.id || !tenant?.id) {
    return { ok: false, code: 'SESSION_INVALID', message: 'This device verification is no longer valid.' };
  }
  if (String(user.status || '').toLowerCase() === 'suspended') {
    return { ok: false, code: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended. Please contact support.' };
  }

  const lifecycle = await evaluateTenantAccess(tenant);
  if (!lifecycle.allowed) return { ok: false, ...lifecycle };

  return {
    ok: true,
    session: {
      ...session,
      role: user.role || session.role || 'member',
      tenant,
      founder: Boolean(lifecycle.founder),
      trialStartedAt: lifecycle.trialStartedAt || tenant.trial_started_at || null,
      trialEndsAt: lifecycle.trialEndsAt || tenant.trial_ends_at || null,
      trialDaysRemaining: lifecycle.trialDaysRemaining ?? null
    }
  };
}

export async function getActiveCustomerSession(event) {
  const access = await getCustomerAccess(event);
  return access.ok ? access.session : null;
}
