import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { assertUserCapacity, entitlementSnapshotFromPlan, launchReadyPlan } from './_entitlements.js';
import { assertBrowserAction, consumeRateLimit, requestIpHash, securityErrorResponseHeaders } from './_security.js';

const defaultCategories = ['Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Emergency Info'];
const LEGAL_VERSION = '2026-08-09';

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
  const rows = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_e164,phone_country_code,phone_number,email_verified,phone_verified&email=${eq(email)}&limit=1`);
  return rows?.[0] || null;
}

async function findByPhone(phoneE164) {
  if (!phoneE164) return null;
  const rows = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_e164,phone_country_code,phone_number,email_verified,phone_verified&phone_e164=${eq(phoneE164)}&limit=1`);
  return rows?.[0] || null;
}

async function loadPlan(planCode) {
  const rows = await selectRows('subscription_plans', `select=code,display_name,trial_days,is_public,is_active,currency,max_users,storage_limit_mb,document_limit,photo_limit,feature_flags&code=${eq(planCode)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  try { assertBrowserAction(event, { csrf: false }); } catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }
  const email = String(body.email || '').trim().toLowerCase();
  const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode || body.countryCode || '+254');
  const phoneNumber = normaliseLocalPhone(body.phoneNumber || body.mobile || '');
  const phoneE164 = String(body.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)).trim();
  const displayName = String(body.displayName || '').trim() || 'Vault User';
  const accountName = String(body.accountName || body.tenantName || '').trim() || `${displayName}'s Private Vault`;
  const planSelectionSource = String(body.planSelectionSource || '').trim() === 'landing_plan_card' ? 'landing_plan_card' : 'default_trial';
  const selectedPlanCode = planSelectionSource === 'landing_plan_card'
    ? (requestedPlan(body.planCode || 'personal') || 'personal')
    : 'personal';
  const legalAccepted = body.legalAccepted === true;
  const legalVersion = String(body.legalVersion || '').trim();

  if (!email || !email.includes('@')) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A valid email address is required for secure account verification.' });
  if (!phoneE164) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A mobile number with country code is required.' });

  try {
    await consumeRateLimit(event, { scope: 'signup_ip', identifier: requestIpHash(event), limit: 8, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    await consumeRateLimit(event, { scope: 'signup_email', identifier: email, limit: 5, windowSeconds: 60 * 60, blockSeconds: 60 * 60 });
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

      const pendingSignup = tenant.account_status === 'pending_verification' || tenant.plan_status === 'signup_pending' || existingUser.status === 'pending_verification';
      if (pendingSignup) {
        if (!legalAccepted || legalVersion !== LEGAL_VERSION) {
          return jsonResponse(409, {
            ok: false,
            version: APP_VERSION,
            code: 'LEGAL_ACCEPTANCE_REQUIRED',
            legalVersion: LEGAL_VERSION,
            message: 'Read and agree to the current Terms of Service and Privacy Policy before continuing the pending signup.'
          });
        }
        const plan = await loadPlan(selectedPlanCode);
        if (!plan?.code || plan.is_active === false || plan.is_public === false || !launchReadyPlan(plan.code)) {
          return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'PLAN_NOT_AVAILABLE', message: 'That plan is not currently available for new accounts.' });
        }
        const now = new Date().toISOString();
        const phoneChanged = Boolean(existingUser.phone_e164 && existingUser.phone_e164 !== phoneE164);
        await updateRow('users', `id=${eq(existingUser.id)}&tenant_id=${eq(tenant.id)}`, {
          display_name: displayName,
          phone_country_code: phoneCountryCode,
          phone_number: phoneNumber,
          phone_e164: phoneE164,
          phone_verified: phoneChanged ? false : Boolean(existingUser.phone_verified),
          onboarding_status: phoneChanged || !existingUser.phone_verified ? 'mobile_verification_required' : 'email_verification_required',
          last_onboarding_step: phoneChanged || !existingUser.phone_verified ? 'account_and_plan_saved' : 'mobile_verified_email_pending',
          updated_at: now
        });
        await updateRow('tenants', `id=${eq(tenant.id)}`, {
          account_name: accountName,
          plan: selectedPlanCode,
          plan_code: selectedPlanCode,
          updated_at: now
        });
        return jsonResponse(200, {
          ok: true,
          connected: true,
          provider: 'supabase',
          version: APP_VERSION,
          tenantId: tenant.id,
          userId: existingUser.id,
          phoneCountryCode,
          phoneNumber,
          phoneE164,
          email: existingUser.email || email,
          displayName,
          accountName,
          planCode: selectedPlanCode,
          planName: plan.display_name || selectedPlanCode,
          trialDays: Number(plan.trial_days || 0),
          planStatus: 'signup_pending',
          accountStatus: 'pending_verification',
          tenantRole: tenant.tenant_role || 'primary_owner',
          reusedExistingTenant: true,
          reusedExistingUser: true,
          resumedPendingSignup: true,
          existingAccount: false,
          requiresOtpVerification: true,
          phoneVerified: phoneChanged ? false : Boolean(existingUser.phone_verified),
          emailVerified: Boolean(existingUser.email_verified),
          message: phoneChanged || !existingUser.phone_verified
            ? 'Your pending signup is ready. Verify your mobile number first, then your email address.'
            : 'Your mobile number is already verified. Continue with email verification.'
        });
      }

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

    if (!legalAccepted || legalVersion !== LEGAL_VERSION) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'LEGAL_ACCEPTANCE_REQUIRED',
        legalVersion: LEGAL_VERSION,
        message: 'Read and agree to the current Terms of Service and Privacy Policy before creating a new account.'
      });
    }

    const plan = await loadPlan(selectedPlanCode);
    if (!plan?.code || plan.is_active === false || plan.is_public === false || !launchReadyPlan(plan.code)) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'PLAN_NOT_AVAILABLE',
        message: 'That plan is not currently available for new accounts. Personal is the available launch plan.'
      });
    }

    const signupEntitlements = entitlementSnapshotFromPlan(plan);
    assertUserCapacity({ effective: signupEntitlements, usage: { users: 0 } }, 1);

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
      onboarding_status: 'mobile_verification_required',
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
        plan_selection_source: planSelectionSource,
        selected_plan_name: plan.display_name || selectedPlanCode,
        trial_days: Number(plan.trial_days || 0),
        entitlements: signupEntitlements,
        legal_acceptance: {
          accepted: true,
          accepted_at: now,
          document_version: LEGAL_VERSION,
          documents: ['terms_of_service', 'privacy_policy'],
          source: 'public_signup'
        }
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
      entitlements: signupEntitlements,
      planStatus: 'signup_pending',
      accountStatus: 'pending_verification',
      tenantRole: 'primary_owner',
      reusedExistingTenant: false,
      reusedExistingUser: false,
      existingAccount: false,
      requiresOtpVerification: true,
      legalVersion: LEGAL_VERSION,
      message: 'Your account is ready for verification. Verify your mobile number first, then your email address.'
    });
  } catch (error) {
    if (error?.code === 'USER_LIMIT_REACHED') {
      return jsonResponse(409, {
        ok: false,
        connected: true,
        provider: 'supabase',
        version: APP_VERSION,
        code: error.code,
        upgradeRequired: true,
        entitlements: error.entitlements || null,
        message: error.message || 'This plan does not have capacity for another user.'
      });
    }
    return jsonResponse(error.status || 500, {
      ok: false,
      connected: true,
      provider: 'supabase',
      version: APP_VERSION,
      message: 'Account setup did not complete. Supabase was reached, but the onboarding step failed.',
      error: error.message,
      details: error.details || null
    }, securityErrorResponseHeaders(error));
  }
}
