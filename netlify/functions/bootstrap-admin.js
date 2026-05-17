import { APP_VERSION, getSql, jsonResponse, parseBody, publicId, requirePost } from './_db.js';

const defaultCategories = ['Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Emergency Info'];

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const sql = await getSql();
  if (!sql) {
    return jsonResponse(200, {
      ok: false,
      connected: false,
      version: APP_VERSION,
      message: 'Database is not configured yet. The app can still run locally, but cloud bootstrap needs NETLIFY_DATABASE_URL or DATABASE_URL.'
    });
  }

  const body = parseBody(event);
  const email = String(body.email || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim() || 'Brian';
  const tenantName = String(body.tenantName || '').trim() || 'Brian Private Vault';

  if (!email || !email.includes('@')) {
    return jsonResponse(400, { ok: false, message: 'A valid admin email is required.' });
  }

  try {
    const tenantId = publicId('tenant');
    const userId = publicId('user');

    await sql`insert into tenants (id, name, plan, status)
      values (${tenantId}, ${tenantName}, 'private_founder', 'active')
      on conflict (name) do nothing`;

    const tenants = await sql`select id from tenants where name = ${tenantName} order by created_at asc limit 1`;
    const finalTenantId = tenants?.[0]?.id || tenantId;

    await sql`insert into users (id, tenant_id, email, display_name, role, status)
      values (${userId}, ${finalTenantId}, ${email}, ${displayName}, 'administrator', 'active')
      on conflict (tenant_id, email) do update set display_name = excluded.display_name, role = 'administrator', status = 'active', updated_at = now()`;

    const users = await sql`select id, email, display_name, role from users where tenant_id = ${finalTenantId} and email = ${email} limit 1`;
    const finalUserId = users?.[0]?.id || userId;

    for (let i = 0; i < defaultCategories.length; i += 1) {
      await sql`insert into categories (id, tenant_id, name, icon, sort_order)
        values (${publicId('cat')}, ${finalTenantId}, ${defaultCategories[i]}, 'folder', ${i + 1})
        on conflict (tenant_id, name) do nothing`;
    }

    await sql`insert into audit_log (id, tenant_id, user_id, action, metadata)
      values (${publicId('audit')}, ${finalTenantId}, ${finalUserId}, 'admin_bootstrap', ${JSON.stringify({ version: APP_VERSION })}::jsonb)`;

    return jsonResponse(200, {
      ok: true,
      connected: true,
      version: APP_VERSION,
      tenantId: finalTenantId,
      userId: finalUserId,
      user: users?.[0] || { id: finalUserId, email, display_name: displayName, role: 'administrator' },
      message: 'Admin tenant bootstrap completed. Save these IDs locally inside the app.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      connected: true,
      version: APP_VERSION,
      message: 'Bootstrap failed. The database connection was reached, but the insert/update step failed.',
      error: error.message
    });
  }
}
