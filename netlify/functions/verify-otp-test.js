import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { issueCustomerSession } from './_auth.js';
import { evaluateTenantAccess, isFounderTenant, recordLifecycleEvent, upsertTrialSubscription } from './_trial.js';
import { createHash } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function hashOtp(challengeId, code) {
  const secret = process.env.OTP_TEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-test-otp-foundation';
  return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex');
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}

async function sendWelcomeEmail({ to, displayName, accountName, planName, trialDays, trialEndsAt }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from || !to) return { sent: false, reason: 'Welcome email delivery is not configured.' };

  const name = String(displayName || '').trim() || 'there';
  const trialCopy = Number(trialDays || 0) > 0
    ? `Your ${trialDays}-day ${planName} trial is now active until ${formatDate(trialEndsAt)}.`
    : `Your ${planName} account is now active.`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: 'Welcome to My Passwords',
      html: `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;"><div style="max-width:560px;margin:0 auto;padding:28px 18px;"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:28px;"><h1 style="margin:0 0 12px;color:#14263b;font-size:26px;">Welcome to My Passwords</h1><p style="line-height:1.6;color:#536579;">Hello ${name},</p><p style="line-height:1.6;color:#536579;">Your account <strong>${accountName}</strong> has been verified. ${trialCopy}</p><p style="line-height:1.6;color:#536579;">You can now create your private encrypted vault and choose a master password. Your master password is never stored or emailed by My Passwords.</p><p style="line-height:1.6;color:#536579;">Secure backup and syncing become available on verified devices after the vault is created.</p><p style="margin-top:22px;font-size:13px;color:#7b8fa3;">Need help? Contact info@zippyweb.uk.</p></div></div></body></html>`,
      text: `Hello ${name}. Your My Passwords account ${accountName} has been verified. ${trialCopy} You can now create your encrypted vault. Your master password is never stored or emailed. Support: info@zippyweb.uk.`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
  return { sent: true, providerId: data?.id || '' };
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });

  const body = parseBody(event);
  const challengeId = String(body.challengeId || '').trim();
  const code = String(body.code || '').replace(/\D/g, '');

  if (!challengeId || code.length !== 6) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A valid challenge ID and 6-digit OTP code are required.' });

  try {
    const rows = await selectRows('otp_challenges', `select=*&id=${eq(challengeId)}&limit=1`);
    const challenge = rows?.[0];
    if (!challenge) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'OTP challenge was not found.' });
    if (!String(challenge.status || '').startsWith('pending')) return jsonResponse(409, { ok: false, version: APP_VERSION, message: `OTP challenge is already ${challenge.status}.` });

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      await updateRow('otp_challenges', `id=${eq(challengeId)}`, { status: 'expired', updated_at: new Date().toISOString() });
      return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This code has expired. Request another code.' });
    }

    const attempts = Number(challenge.attempts || 0) + 1;
    if (String(challenge.otp_hash || '') !== hashOtp(challengeId, code)) {
      const locked = attempts >= 5;
      await updateRow('otp_challenges', `id=${eq(challengeId)}`, {
        attempts,
        status: locked ? 'failed_too_many_attempts' : challenge.status,
        updated_at: new Date().toISOString()
      });
      return jsonResponse(401, { ok: false, version: APP_VERSION, attempts, message: locked ? 'Too many incorrect attempts. Request another code.' : 'OTP code did not match.' });
    }

    const now = new Date().toISOString();
    const isEmail = String(challenge.delivery_channel || '').includes('email');
    await updateRow('otp_challenges', `id=${eq(challengeId)}`, {
      attempts,
      status: isEmail ? 'verified_email' : 'verified_sms',
      verified_at: now,
      updated_at: now
    });

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
      last_onboarding_step: firstActivation ? 'email_verified_trial_started' : 'device_verified',
      onboarding_completed_at: firstActivation ? now : undefined,
      updated_at: now
    };
    if (!firstActivation) delete verifiedUserPatch.onboarding_completed_at;
    await updateRow('users', `id=${eq(user.id)}&tenant_id=${eq(tenant.id)}`, verifiedUserPatch);

    let welcomeEmail = { sent: false, skipped: true };
    if (firstActivation && isEmail && user.email && !user.welcome_email_sent_at) {
      welcomeEmail = await sendWelcomeEmail({
        to: user.email,
        displayName: user.display_name,
        accountName: tenant.account_name || tenant.name || 'My Private Vault',
        planName,
        trialDays,
        trialEndsAt
      });
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

    const lifecycle = await evaluateTenantAccess({
      ...tenant,
      plan_status: planStatus,
      account_status: accountStatus,
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt
    });
    const cloudAccess = Boolean(lifecycle.allowed);
    const message = !cloudAccess
      ? lifecycle.message
      : firstActivation
        ? (trialDays ? `Account verified. Your ${trialDays}-day ${planName} trial is now active.` : `Account verified. Your ${planName} account is now active.`)
        : 'Device verified. Cloud backup and secure syncing are active.';

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      testMode: process.env.OTP_TEST_MODE === 'true',
      challengeId,
      tenantId: tenant.id,
      userId: user.id,
      role: user.role || 'administrator',
      authenticated: true,
      cloudAccess,
      accessCode: cloudAccess ? '' : lifecycle.code || 'ACCOUNT_ACCESS_PAUSED',
      onboardingCompleted: firstActivation,
      welcomeEmailSent: Boolean(welcomeEmail.sent),
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
      message
    }, {
      'set-cookie': issueCustomerSession(event, { tenantId: tenant.id, userId: user.id, role: user.role || 'administrator' })
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not verify the code.', error: error.message, details: error.details || null });
  }
}
