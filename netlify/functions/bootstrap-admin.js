import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';

const defaultCategories = ['Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Emergency Info'];

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

async function findExistingUser(email, phoneE164) {
  if (phoneE164) {
    const byPhone = await selectRows('users', `select=id,tenant_id,email,display_name,role,phone_e164,phone_country_code,phone_number&phone_e164=${eq(phoneE164)}&limit=1`);
    if (byPhone?.[0]) return byPhone[0];
  }
  if (email) {
    const byEmail = await selectRows('users', `select=id,tenant_id,email,display_name,role,phone_e164,phone_country_code,phone_number&email=${eq(email)}&limit=1`);
    if (byEmail?.[0]) return byEmail[0];
  }
  return null;
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  const email = String(body.email || '').trim().toLowerCase();
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || body.countryCode || '+254');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || body.mobile || '');
  const phoneE164 = String(body.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)).trim();
  const displayName = String(body.displayName || '').trim() || 'Vault User';
  const accountName = String(body.accountName || body.tenantName || '').trim() || `${phoneE164 || email || 'Private'} Vault`;
  const tenantName = String(body.tenantName || body.accountName || '').trim() || accountName;
  const requestedPlanCode = String(body.planCode || '').trim() || 'personal_free';
  const requestedPlanStatus = String(body.planStatus || '').trim() || 'trial_pending';
  const requestedAccountStatus = String(body.accountStatus || '').trim() || 'active';
  const requestedTenantRole = String(body.tenantRole || '').trim() || 'primary_owner';

  if (!phoneE164) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A mobile number with country code is required for the account login foundation.' });
  }

  if (email && !email.includes('@')) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'The backup email address is not valid.' });
  }

  try {
    const existingUser = await findExistingUser(email, phoneE164);
    let finalTenantId = existingUser?.tenant_id || '';
    let finalUserId = existingUser?.id || '';
    let existingTenant = null;

    if (finalTenantId) {
      const existingTenants = await selectRows('tenants', `select=id,name,status,plan,account_name,plan_code,plan_status,account_status,tenant_role&id=${eq(finalTenantId)}&limit=1`);
      existingTenant = existingTenants?.[0] || null;
      if (existingTenant) {
        await updateRow('tenants', `id=${eq(finalTenantId)}`, {
          name: existingTenant.name || tenantName,
          plan: existingTenant.plan || requestedPlanCode || 'personal_free',
          status: requestedAccountStatus || 'active',
          account_name: existingTenant.account_name || accountName,
          plan_code: existingTenant.plan_code || requestedPlanCode,
          plan_status: existingTenant.plan_status || requestedPlanStatus,
          account_status: requestedAccountStatus || 'active',
          tenant_role: existingTenant.tenant_role || requestedTenantRole,
          updated_at: new Date().toISOString()
        });
      }
    }

    if (!finalTenantId) {
      const existingTenants = await selectRows('tenants', `select=id,name,status,plan,account_name,plan_code,plan_status,account_status,tenant_role&name=${eq(tenantName)}&limit=1`);
      existingTenant = existingTenants?.[0] || null;
      finalTenantId = existingTenant?.id || '';

      if (!finalTenantId) {
        finalTenantId = publicId('tenant');
        await insertRow('tenants', {
          id: finalTenantId,
          name: tenantName,
          plan: requestedPlanCode,
          status: requestedAccountStatus,
          account_name: accountName,
          plan_code: requestedPlanCode,
          plan_status: requestedPlanStatus,
          account_status: requestedAccountStatus,
          tenant_role: requestedTenantRole
        });
      } else {
        await updateRow('tenants', `id=${eq(finalTenantId)}`, {
          name: tenantName,
          plan: existingTenant?.plan || requestedPlanCode,
          status: requestedAccountStatus,
          account_name: existingTenant?.account_name || accountName,
          plan_code: existingTenant?.plan_code || requestedPlanCode,
          plan_status: existingTenant?.plan_status || requestedPlanStatus,
          account_status: requestedAccountStatus,
          tenant_role: existingTenant?.tenant_role || requestedTenantRole,
          updated_at: new Date().toISOString()
        });
      }
    }

    if (!finalUserId) {
      finalUserId = publicId('user');
      await insertRow('users', {
        id: finalUserId,
        tenant_id: finalTenantId,
        email,
        display_name: displayName,
        role: 'administrator',
        status: 'active',
        phone_country_code: phoneCountryCode,
        phone_number: phoneNumber,
        phone_e164: phoneE164,
        phone_verified: false,
        email_verified: false,
        account_login_method: 'phone_otp_ready'
      });
    } else {
      await updateRow('users', `id=${eq(finalUserId)}`, {
        email: email || existingUser.email || '',
        display_name: displayName,
        role: existingUser.role || 'administrator',
        status: 'active',
        phone_country_code: phoneCountryCode,
        phone_number: phoneNumber,
        phone_e164: phoneE164,
        account_login_method: 'phone_otp_ready',
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
      action: existingUser ? 'saas_account_foundation_rechecked' : 'saas_account_foundation_created',
      metadata: { version: APP_VERSION, provider: 'supabase', phone_e164: phoneE164, otp_ready: true, email_backup_present: Boolean(email), account_name: accountName, plan_code: requestedPlanCode, plan_status: requestedPlanStatus, tenant_role: requestedTenantRole }
    });

    return jsonResponse(200, {
      ok: true,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      tenantId: finalTenantId,
      userId: finalUserId,
      phoneCountryCode,
      phoneNumber,
      phoneE164,
      email,
      accountName,
      planCode: requestedPlanCode,
      planStatus: requestedPlanStatus,
      accountStatus: requestedAccountStatus,
      tenantRole: requestedTenantRole,
      reusedExistingTenant: !!existingTenant?.id || !!existingUser?.tenant_id,
      reusedExistingUser: !!existingUser?.id,
      otpReady: true,
      otpProviderConnected: false,
      user: { id: finalUserId, email, display_name: displayName, role: existingUser?.role || 'administrator', phone_e164: phoneE164 },
      message: existingUser
        ? 'SaaS account foundation already existed. Existing Supabase tenant/user IDs were rechecked and saved locally.'
        : 'SaaS account foundation created in Supabase. Phone is stored in international SMS format.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      message: 'Account login foundation failed. Supabase was reached, but the insert/update step failed.',
      error: error.message,
      details: error.details || null
    });
  }
}
