import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { createVerifiedCustomerSession } from './_account-session.js';
import { evaluateTenantAccess, isFounderTenant, recordLifecycleEvent, upsertTrialSubscription } from './_trial.js';
import { resolveTenantEntitlements } from './_entitlements.js';
import { verifyAccountOtp } from './_account-otp.js';
import { sendCustomerLifecycleEmail } from './_customer-email.js';
import { assertBrowserAction, consumeRateLimit, csrfTokenForSession, resetRateLimit, requestIpHash, securityErrorResponseHeaders } from './_security.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  try { assertBrowserAction(event, { csrf: false }); } catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }
  const challengeId = String(body.challengeId || '').trim();
  const code = String(body.code || '').replace(/\D/g, '');

  if (!challengeId || code.length !== 6) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A valid challenge ID and 6-digit OTP code are required.' });

  try {
    await consumeRateLimit(event, { scope: 'otp_verify_ip', identifier: requestIpHash(event), limit: 20, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    await consumeRateLimit(event, { scope: 'otp_verify_challenge', identifier: challengeId, limit: 6, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    const challenge = await verifyAccountOtp({ challengeId, code });
    const now = challenge.verified_at || new Date().toISOString();
    const isEmail = String(challenge.delivery_channel || '').includes('email');

    const users = await selectRows('users', `select=id,tenant_id,role,status,email,display_name,email_verified,phone_verified,welcome_email_sent_at&id=${eq(challenge.user_id)}&tenant_id=${eq(challenge.tenant_id)}&limit=1`);
    const tenants = await selectRows('tenants', `select=id,account_name,name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at&id=${eq(challenge.tenant_id)}&limit=1`);
    const user = users?.[0];
    const tenant = tenants?.[0];
    if (!user?.id || !tenant?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The account linked to this code is incomplete.' });

    const firstActivation = tenant.account_status === 'pending_verification' || tenant.plan_status === 'signup_pending';
    const founder = isFounderTenant(tenant);
    let planStatus = tenant.plan_status || 'trial_pending';
    let accountStatus = tenant.account_status || 'active';
    let trialStartedAt = tenant.trial_started_at || null;
    let trialEndsAt = tenant.trial_ends_at || null;
    let trialDays = 0;
    let planName = tenant.plan_code || 'Personal';
    let subscription = null;
    const planRows = founder ? [] : await selectRows('subscription_plans', `select=code,display_name,trial_days,is_active&code=${eq(tenant.plan_code || 'personal')}&limit=1`).catch(() => []);
    const selectedPlan = planRows?.[0] || null;
    if (selectedPlan?.code) {
      planName = selectedPlan.display_name || selectedPlan.code;
      trialDays = Math.max(0, Number(selectedPlan.trial_days || 0));
    }

    if (firstActivation && !founder) {
      const plan = selectedPlan;
      if (!plan?.code || plan.is_active === false) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The selected plan is no longer available. Please contact support.' });
      trialStartedAt = trialDays ? now : null;
      trialEndsAt = trialDays ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null;
      planStatus = trialDays ? 'trial_active' : 'active';
      accountStatus = 'active';
      await updateRow('tenants', `id=${eq(tenant.id)}`, {
        status: 'active',
        account_status: accountStatus,
        plan_status: planStatus,
        trial_started_at: trialStartedAt,
        trial_ends_at: trialEndsAt,
        onboarding_completed_at: now,
        updated_at: now
      });
      subscription = await upsertTrialSubscription({
        tenant: { ...tenant, plan_code: plan.code },
        trialStartedAt,
        trialEndsAt,
        status: trialDays ? 'trialing' : 'active',
        metadata: { version: APP_VERSION, onboarding_completed: true, selected_plan_name: planName }
      });
      await recordLifecycleEvent({
        tenantId: tenant.id,
        subscriptionId: subscription?.id || null,
        eventType: trialDays ? 'trial_started' : 'account_activated',
        status: 'recorded',
        metadata: { plan_code: plan.code, plan_name: planName, trial_days: trialDays, trial_started_at: trialStartedAt, trial_ends_at: trialEndsAt }
      });
    } else if (firstActivation && founder) {
      planStatus = 'founder_active';
      accountStatus = 'active';
      await updateRow('tenants', `id=${eq(tenant.id)}`, {
        status: 'active',
        account_status: 'active',
        plan_status: 'founder_active',
        trial_started_at: null,
        trial_ends_at: null,
        onboarding_completed_at: now,
        updated_at: now
      });
    }

    const verifiedUserPatch = {
      status: 'active',
      email_verified: isEmail ? true : Boolean(user.email_verified),
      phone_verified: isEmail ? Boolean(user.phone_verified) : true,
      otp_test_last_verified_at: now,
      otp_test_status: isEmail ? 'verified_email' : 'verified_sms',
      last_login_at: now,
      onboarding_status: firstActivation ? 'onboarding_complete' : 'active_account_verified',
      last_onboarding_step: firstActivation ? (isEmail ? 'email_verified_trial_started' : 'mobile_verified_trial_started') : 'device_verified',
      onboarding_completed_at: firstActivation ? now : undefined,
      updated_at: now
    };
    if (!firstActivation) delete verifiedUserPatch.onboarding_completed_at;
    await updateRow('users', `id=${eq(user.id)}&tenant_id=${eq(tenant.id)}`, verifiedUserPatch);

    let welcomeEmail = { sent: false, skipped: true };
    if (firstActivation && user.email && (isEmail || user.email_verified) && !user.welcome_email_sent_at) {
      welcomeEmail = await sendCustomerLifecycleEmail({
        tenantId: tenant.id,
        userId: user.id,
        to: user.email,
        type: trialDays ? 'welcome_trial_started' : 'welcome_account_activated',
        idempotencyKey: `welcome:${tenant.id}`,
        context: {
          displayName: user.display_name,
          accountName: tenant.account_name || tenant.name || 'My Private Vault',
          planName,
          trialEndsAt
        },
        metadata: { source: 'account_activation', trial_days: trialDays }
      }).catch((error) => ({ sent: false, reason: error.message || 'Welcome email could not be queued.' }));
      if (welcomeEmail.sent) {
        await updateRow('users', `id=${eq(user.id)}&tenant_id=${eq(tenant.id)}`, { welcome_email_sent_at: now, updated_at: now }).catch(() => null);
      }
    }

    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: tenant.id,
      user_id: user.id,
      action: firstActivation ? 'production_onboarding_completed' : 'secure_customer_session_issued',
      metadata: {
        version: APP_VERSION,
        delivery_channel: challenge.delivery_channel,
        plan_code: tenant.plan_code || 'personal',
        plan_status: planStatus,
        trial_started_at: trialStartedAt,
        trial_ends_at: trialEndsAt,
        welcome_email_sent: Boolean(welcomeEmail.sent)
      }
    }).catch(() => null);

    const verifiedSession = await createVerifiedCustomerSession(event, {
      tenantId: tenant.id,
      userId: user.id,
      role: user.role || 'administrator',
      clientDeviceId: String(body.clientDeviceId || '').trim(),
      deviceName: String(body.deviceName || '').trim(),
      deviceType: String(body.deviceType || '').trim(),
      platform: String(body.platform || '').trim(),
      browser: String(body.browser || '').trim(),
      userAgent: String(body.userAgent || '').trim()
    });
    await resetRateLimit(event, { scope: 'otp_verify_challenge', identifier: challengeId });

    const lifecycle = await evaluateTenantAccess({
      ...tenant,
      plan_status: planStatus,
      account_status: accountStatus,
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt
    });
    const entitlementContext = await resolveTenantEntitlements(tenant.id);
    const backupIncluded = entitlementContext.effective.features.cloudBackupSync !== false;
    const cloudAccess = Boolean(lifecycle.allowed && backupIncluded);
    const accessCode = lifecycle.allowed && !backupIncluded
      ? 'PLAN_FEATURE_REQUIRED'
      : (cloudAccess ? '' : lifecycle.code || 'ACCOUNT_ACCESS_PAUSED');
    const message = lifecycle.allowed && !backupIncluded
      ? (firstActivation
          ? `Account verified. Your ${planName} vault is active on this device. Cloud backup and syncing are not included in the current plan.`
          : 'Device verified. Your encrypted local vault is available, but cloud backup and syncing are not included in the current plan.')
      : !cloudAccess
        ? lifecycle.message
        : firstActivation
          ? (trialDays ? `Account verified. Your ${trialDays}-day ${planName} trial is now active.` : `Account verified. Your ${planName} account is now active.`)
          : 'Device verified. Cloud backup and secure syncing are active.';

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      testMode: process.env.CONTEXT !== 'production' && (process.env.SMS_TEST_MODE === 'true' || process.env.OTP_TEST_MODE === 'true' || process.env.CONTEXT === 'dev'),
      challengeId,
      tenantId: tenant.id,
      userId: user.id,
      role: user.role || 'administrator',
      authenticated: true,
      csrfToken: csrfTokenForSession({ sessionId: verifiedSession.session.id }, 'customer'),
      cloudAccess,
      accessCode,
      onboardingCompleted: firstActivation,
      welcomeEmailSent: Boolean(welcomeEmail.sent),
      entitlements: entitlementContext.serialized,
      account: {
        accountName: tenant.account_name || tenant.name || '',
        planCode: tenant.plan_code || 'personal',
        planName,
        planStatus,
        accountStatus,
        tenantRole: tenant.tenant_role || 'primary_owner',
        trialDays,
        trialStartedAt,
        trialEndsAt
      },
      deviceId: verifiedSession.device.id,
      sessionExpiresAt: verifiedSession.expiresAt,
      message
    }, {
      'set-cookie': verifiedSession.cookie
    });
  } catch (error) {
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, code: error.code || 'OTP_VERIFY_FAILED', message: error.message || 'Could not verify the code.', error: error.status ? undefined : error.message, details: error.details || null }, securityErrorResponseHeaders(error));
  }
}
