import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows } from './_db.js';

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

function allowedRequestedPlan(value) {
  const plan = String(value || '').trim().toLowerCase();
  if (['family', 'family_foundation', 'family_trial'].includes(plan)) return 'family';
  if (['business', 'business_foundation', 'business_trial'].includes(plan)) return 'business';
  return 'personal';
}

async function findExistingUser(email, phoneE164) {
  if (phoneE164) {
    const byPhone = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_e164,phone_country_code,phone_number&phone_e164=${eq(phoneE164)}&limit=1`);
    if (byPhone?.[0]) return byPhone[0];
  }
  if (email) {
    const byEmail = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_e164,phone_country_code,phone_number&email=${eq(email)}&limit=1`);
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
  const selectedPlanCode = allowedRequestedPlan(body.planCode);

  if (!phoneE164) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A mobile number with country code is required.' });
  if (email && !email.includes('@')) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'The backup email address is not valid.' });

  try {
    const existingUser = await findExistingUser(email, phoneE164);
    if (existingUser?.id && existingUser?.tenant_id) {
      const tenants = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role&id=${eq(existingUser.tenant_id)}&limit=1`);
      const tenant = tenants?.[0];
      if (!tenant?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The existing account is incomplete. Please contact support.' });
      return jsonResponse(200, {
        ok: true,
        connected: true,
        provider: 'supabase',
        version: APP_VERSION,
        tenantId: tenant.id,
        userId: existingUser.id,
        phoneCountryCode: existingUser.phone_country_code || phoneCountryCode,
        phoneNumber: existingUser.phone_number || phoneNumber,
        phoneE164: existingUser.phone_e164 || phoneE164,
        email: existingUser.email || email,
        accountName: tenant.account_name || tenant.name || accountName,
        planCode: tenant.plan_code || 'personal',
        planStatus: tenant.plan_status || 'trial_pending',
        accountStatus: tenant.account_status || 'active',
        tenantRole: tenant.tenant_role || 'primary_owner',
        reusedExistingTenant: true,
        reusedExistingUser: true,
        requiresOtpVerification: true,
        message: 'Account found. Verify the one-time code to enable secure backup and syncing on this device.'
      });
    }

    const finalTenantId = publicId('tenant');
    const finalUserId = publicId('user');
    const tenantNameRows = await selectRows('tenants', `select=id&name=${eq(accountName)}&limit=1`);
    const uniqueTenantName = tenantNameRows?.[0]?.id ? `${accountName} ${finalTenantId.slice(-6)}` : accountName;

    await insertRow('tenants', {
      id: finalTenantId,
      name: uniqueTenantName,
      plan: selectedPlanCode,
      status: 'pending_verification',
      account_name: accountName,
      plan_code: selectedPlanCode,
      plan_status: 'signup_pending',
      account_status: 'pending_verification',
      tenant_role: 'primary_owner'
    });

    await insertRow('users', {
      id: finalUserId,
      tenant_id: finalTenantId,
      email,
      display_name: displayName,
      role: 'administrator',
      status: 'pending_verification',
      phone_country_code: phoneCountryCode,
      phone_number: phoneNumber,
      phone_e164: phoneE164,
      phone_verified: false,
      email_verified: false,
      account_login_method: 'email_otp_session'
    });

    for (let i = 0; i < defaultCategories.length; i += 1) {
      await insertRow('categories', {
        id: publicId('cat'),
        tenant_id: finalTenantId,
        name: defaultCategories[i],
        icon: 'folder',
        sort_order: i + 1
      });
    }

    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: finalTenantId,
      user_id: finalUserId,
      action: 'saas_signup_pending_verification_created',
      metadata: { version: APP_VERSION, selected_plan_code: selectedPlanCode, email_backup_present: Boolean(email) }
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
      planCode: selectedPlanCode,
      planStatus: 'signup_pending',
      accountStatus: 'pending_verification',
      tenantRole: 'primary_owner',
      reusedExistingTenant: false,
      reusedExistingUser: false,
      requiresOtpVerification: true,
      message: 'Account details saved. Verify the email code to activate the account and enable secure backup and syncing.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      message: 'Account foundation failed. Supabase was reached, but the account step did not complete.',
      error: error.message,
      details: error.details || null
    });
  }
}
