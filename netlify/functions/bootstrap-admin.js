import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow, upsertRow } from './_db.js';

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
    // Bootstrap must be safely repeatable. Never update an existing tenant's id,
    // because users/categories/vault rows may already reference it.
    const existingTenants = await selectRows('tenants', `select=id,name,status,plan&name=${eq(tenantName)}&limit=1`);
    let finalTenantId = existingTenants?.[0]?.id || '';

    if (!finalTenantId) {
      finalTenantId = publicId('tenant');
      await insertRow('tenants', {
        id: finalTenantId,
        name: tenantName,
        plan: 'private_founder',
        status: 'active'
      });
    } else {
      await updateRow('tenants', `id=${eq(finalTenantId)}`, {
        name: tenantName,
        plan: existingTenants?.[0]?.plan || 'private_founder',
        status: 'active',
        updated_at: new Date().toISOString()
      });
    }

    const existingUsers = await selectRows('users', `select=id,email,display_name,role&tenant_id=${eq(finalTenantId)}&email=${eq(email)}&limit=1`);
    let finalUserId = existingUsers?.[0]?.id || '';

    if (!finalUserId) {
      finalUserId = publicId('user');
      await insertRow('users', {
        id: finalUserId,
        tenant_id: finalTenantId,
        email,
        display_name: displayName,
        role: 'administrator',
        status: 'active'
      });
    } else {
      await updateRow('users', `id=${eq(finalUserId)}`, {
        email,
        display_name: displayName,
        role: 'administrator',
        status: 'active',
        updated_at: new Date().toISOString()
      });
    }

    for (let i = 0; i < defaultCategories.length; i += 1) {
      const existingCategories = await selectRows('categories', `select=id,name&tenant_id=${eq(finalTenantId)}&name=${eq(defaultCategories[i])}&limit=1`);
      if (!existingCategories?.[0]?.id) {
        await insertRow('categories', {
          id: publicId('cat'),
          tenant_id: finalTenantId,
          name: defaultCategories[i],
          icon: 'folder',
          sort_order: i + 1
        });
      } else {
        await updateRow('categories', `id=${eq(existingCategories[0].id)}`, {
          icon: 'folder',
          sort_order: i + 1
        });
      }
    }

    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: finalTenantId,
      user_id: finalUserId,
      action: existingTenants?.[0]?.id ? 'admin_bootstrap_rechecked' : 'admin_bootstrap',
      metadata: { version: APP_VERSION, provider: 'supabase', repeat_safe: true }
    });

    return jsonResponse(200, {
      ok: true,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      tenantId: finalTenantId,
      userId: finalUserId,
      reusedExistingTenant: !!existingTenants?.[0]?.id,
      reusedExistingUser: !!existingUsers?.[0]?.id,
      user: existingUsers?.[0] || { id: finalUserId, email, display_name: displayName, role: 'administrator' },
      message: existingTenants?.[0]?.id
        ? 'Admin tenant already existed. Existing Supabase tenant/user IDs were rechecked and saved locally.'
        : 'Admin tenant bootstrap completed in Supabase and IDs saved locally.'
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
