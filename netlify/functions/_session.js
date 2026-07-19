import { selectRows } from './_db.js';
import { readCustomerSession } from './_auth.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function getActiveCustomerSession(event) {
  const session = readCustomerSession(event);
  if (!session?.tenantId || !session?.userId) return null;
  const users = await selectRows('users', `select=id,tenant_id,role,status&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
  const tenants = await selectRows('tenants', `select=id,account_status&id=${eq(session.tenantId)}&limit=1`);
  const user = users?.[0];
  const tenant = tenants?.[0];
  if (!user?.id || !tenant?.id) return null;
  if (String(user.status || '').toLowerCase() === 'suspended') return null;
  if (String(tenant.account_status || '').toLowerCase() === 'suspended') return null;
  return { ...session, role: user.role || session.role || 'member' };
}
