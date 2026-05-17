import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, upsertRow } from './_db.js';

const defaultCategories = ['Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Emergency Info'];

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  const email = String(body.email || '').trim().toLowerCase();
  const displayName = String(body.displayName || '').trim() || 'Brian';
  const tenantName = String(body.tenantName || '').trim() || 'Brian Private Vault';

  if (!email || !email.includes('@')) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A valid admin email is required.' });
  }

  try {
    const tenantId = publicId('tenant');
    const userId = publicId('user');

    await upsertRow('tenants', {
      id: tenantId,
      name: tenantName,
      plan: 'private_founder',
      status: 'active'
    }, 'name');

    const tenants = await selectRows('tenants', `select=id,name&name=${eq(tenantName)}&order=created_at.asc&limit=1`);
    const finalTenantId = tenants?.[0]?.id || tenantId;

    await upsertRow('users', {
      id: userId,
      tenant_id: finalTenantId,
      email,
      display_name: displayName,
      role: 'administrator',
      status: 'active',
      updated_at: new Date().toISOString()
    }, 'tenant_id,email');

    const users = await selectRows('users', `select=id,email,display_name,role&tenant_id=${eq(finalTenantId)}&email=${eq(email)}&limit=1`);
    const finalUserId = users?.[0]?.id || userId;

    for (let i = 0; i < defaultCategories.length; i += 1) {
      await upsertRow('categories', {
        id: publicId('cat'),
        tenant_id: finalTenantId,
        name: defaultCategories[i],
        icon: 'folder',
        sort_order: i + 1
      }, 'tenant_id,name');
    }

    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: finalTenantId,
      user_id: finalUserId,
      action: 'admin_bootstrap',
      metadata: { version: APP_VERSION, provider: 'supabase' }
    });

    return jsonResponse(200, {
      ok: true,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      tenantId: finalTenantId,
      userId: finalUserId,
      user: users?.[0] || { id: finalUserId, email, display_name: displayName, role: 'administrator' },
      message: 'Admin tenant bootstrap completed in Supabase and IDs saved locally.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      message: 'Bootstrap failed. Supabase was reached, but the insert/update step failed.',
      error: error.message,
      details: error.details || null
    });
  }
}
