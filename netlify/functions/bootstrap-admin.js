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

function requestedPlan(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

async function findByEmail(email) {
  if (!email) return null;
  const rows = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_e164,phone_country_code,phone_number&email=${eq(email)}&limit=1`);
  return rows?.[0] || null;
}

async function findByPhone(phoneE164) {
  if (!phoneE164) return null;
  const rows = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_e164,phone_country_code,phone_number&phone_e164=${eq(phoneE164)}&limit=1`);
  return rows?.[0] || null;
}

async function loadPlan(planCode) {
  const rows = await selectRows('subscription_plans', `select=code,display_name,trial_days,is_public,is_active,currency&code=${eq(planCode)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  const email = String(body.email || '').trim().toLowerCase();
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || body.countryCode || '+254');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || body.mobile || '');
  const phoneE164 = String(body.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)).trim();
  const displayName = String(body.displayName || '').trim() || 'Vault User';
  const accountName = String(body.accountName || body.tenantName || '').trim() || `${displayName}'s Private Vault`;
  const selectedPlanCode = requestedPlan(body.planCode || 'personal') || 'personal';

  if (!email || !email.includes('@')) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A valid email address is required for secure account verification.' });
  if (!phoneE164) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A mobile number with country code is required.' });

  try {
    const [emailUser, phoneUser] = await Promise.all([findByEmail(email), findByPhone(phoneE164)]);
    if (emailUser?.id && phoneUser?.id && emailUser.id !== phoneUser.id) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'ACCOUNT_DETAILS_CONFLICT',
        message: 'That email address and mobile number are linked to different accounts. Please use the details from one existing account or contact support.'
      });
    }

    const existingUser = emailUser || phoneUser;
    if (existingUser?.id && existingUser?.tenant_id) {
      const tenants = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at&id=${eq(existingUser.tenant_id)}&limit=1`);
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
        displayName: existingUser.display_name || displayName,
        accountName: tenant.account_name || tenant.name || accountName,
        planCode: tenant.plan_code || 'personal',
        planStatus: tenant.plan_status || 'trial_pending',
        accountStatus: tenant.account_status || 'active',
        tenantRole: tenant.tenant_role || 'primary_owner',
        trialStartedAt: tenant.trial_started_at || null,
        trialEndsAt: tenant.trial_ends_at || null,
        reusedExistingTenant: true,
        reusedExistingUser: true,
        existingAccount: true,
        requiresOtpVerification: true,
        message: 'An account already exists for these details. Request an email code to verify this device and continue with the existing account.'
      });
    }

    const plan = await loadPlan(selectedPlanCode);
    if (!plan?.code || plan.is_active === false || plan.is_public === false) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'PLAN_NOT_AVAILABLE',
        message: 'That plan is not currently available for new accounts. Choose a published plan or ask the administrator to publish it first.'
      });
    }

    const finalTenantId = publicId('tenant');
    const finalUserId = publicId('user');
    const tenantNameRows = await selectRows('tenants', `select=id&name=${eq(accountName)}&limit=1`);
    const uniqueTenantName = tenantNameRows?.[0]?.id ? `${accountName} ${finalTenantId.slice(-6)}` : accountName;
    const now = new Date().toISOString();

    await insertRow('tenants', {
      id: finalTenantId,
      name: uniqueTenantName,
      plan: selectedPlanCode,
      status: 'pending_verification',
      account_name: accountName,
      plan_code: selectedPlanCode,
      plan_status: 'signup_pending',
      trial_started_at: null,
      trial_ends_at: null,
      account_status: 'pending_verification',
      tenant_role: 'primary_owner',
      updated_at: now
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
      account_login_method: 'email_otp_session',
      onboarding_status: 'email_verification_required',
      last_onboarding_step: 'account_and_plan_saved',
      updated_at: now
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
      action: 'production_signup_pending_verification_created',
      metadata: {
        version: APP_VERSION,
        selected_plan_code: selectedPlanCode,
        selected_plan_name: plan.display_name || selectedPlanCode,
        trial_days: Number(plan.trial_days || 0)
      }
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
      displayName,
      accountName,
      planCode: selectedPlanCode,
      planName: plan.display_name || selectedPlanCode,
      trialDays: Number(plan.trial_days || 0),
      planStatus: 'signup_pending',
      accountStatus: 'pending_verification',
      tenantRole: 'primary_owner',
      reusedExistingTenant: false,
      reusedExistingUser: false,
      existingAccount: false,
      requiresOtpVerification: true,
      message: 'Your account and selected plan are ready. Request the email code to verify the account and start the trial.'
    });
  } catch (error) {
    return jsonResponse(500, {
      ok: false,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      message: 'Account setup did not complete. Supabase was reached, but the onboarding step failed.',
      error: error.message,
      details: error.details || null
    });
  }
}
