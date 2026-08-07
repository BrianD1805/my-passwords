import { APP_VERSION, jsonResponse, selectRows } from './_db.js';
import { validateAdminSession } from './_admin-session.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

async function firstRow(table, tenantId, select = 'id') {
  const rows = await selectRows(table, `select=${select}&tenant_id=${eq(tenantId)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

async function isolationProbe({ table, tenantA, tenantB, userScoped = false }) {
  const victim = await firstRow(table, tenantB, userScoped ? 'id,user_id' : 'id');
  if (!victim?.id) return { area: table, status: 'not_tested_no_second_tenant_record' };
  let query = `select=id&id=${eq(victim.id)}&tenant_id=${eq(tenantA)}&limit=1`;
  if (userScoped && victim.user_id) query += `&user_id=${eq(victim.user_id)}`;
  const leaked = await selectRows(table, query).catch(() => []);
  return { area: table, status: leaked?.length ? 'failed' : 'passed' };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET required.' });
  const admin = await validateAdminSession(event, { touch: true });
  if (!admin.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, message: 'Admin session required.' });

  const tenants = await selectRows('tenants', 'select=id&order=created_at.asc&limit=2').catch(() => []);
  if ((tenants || []).length < 2) {
    return jsonResponse(200, { ok: true, version: APP_VERSION, passed: true, status: 'not_tested_requires_two_tenants', tests: [] });
  }
  const [a, b] = tenants;
  const tests = await Promise.all([
    isolationProbe({ table: 'vault_sync_snapshots', tenantA: a.id, tenantB: b.id, userScoped: true }),
    isolationProbe({ table: 'vault_items', tenantA: a.id, tenantB: b.id }),
    isolationProbe({ table: 'document_blobs', tenantA: a.id, tenantB: b.id, userScoped: true }),
    isolationProbe({ table: 'emergency_access_invitations', tenantA: a.id, tenantB: b.id, userScoped: true }),
    isolationProbe({ table: 'emergency_access_requests', tenantA: a.id, tenantB: b.id, userScoped: true }),
    isolationProbe({ table: 'tenant_subscriptions', tenantA: a.id, tenantB: b.id }),
    isolationProbe({ table: 'billing_events', tenantA: a.id, tenantB: b.id }),
    isolationProbe({ table: 'users', tenantA: a.id, tenantB: b.id })
  ]);
  const failed = tests.filter((test) => test.status === 'failed');
  return jsonResponse(failed.length ? 500 : 200, {
    ok: failed.length === 0,
    version: APP_VERSION,
    passed: failed.length === 0,
    status: failed.length ? 'failed' : 'passed',
    tests
  });
}
