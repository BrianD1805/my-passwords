import { readCustomerSession } from './_auth.js';
import { selectRows } from './_db.js';
import { isFounderTenant, loadTenantSubscription } from './_trial.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function getBillingContext(event) {
  const session = readCustomerSession(event);
  if (!session?.tenantId || !session?.userId) return { ok: false, code: 'SESSION_REQUIRED', message: 'Verify this device before managing a subscription.' };
  const [users, tenants, subscription] = await Promise.all([
    selectRows('users', `select=id,tenant_id,email,display_name,role,status&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`),
    selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at&id=${eq(session.tenantId)}&limit=1`),
    loadTenantSubscription(session.tenantId)
  ]);
  const user = users?.[0];
  const tenant = tenants?.[0];
  if (!user?.id || !tenant?.id) return { ok: false, code: 'SESSION_INVALID', message: 'This device verification is no longer valid.' };
  if (String(user.status || '').toLowerCase() === 'suspended' || String(tenant.account_status || '').toLowerCase() === 'suspended') return { ok: false, code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended. Please contact support.' };
  if (isFounderTenant(tenant)) return { ok: false, code: 'FOUNDER_EXEMPT', message: 'Founder access is permanent and does not require a subscription.', founder: true, user, tenant, subscription };
  return { ok: true, session, user, tenant, subscription };
}
