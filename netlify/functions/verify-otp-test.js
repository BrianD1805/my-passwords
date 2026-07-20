import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { issueCustomerSession } from './_auth.js';
import { createHash } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function hashOtp(challengeId, code) {
  const secret = process.env.OTP_TEST_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-test-otp-foundation';
  return createHash('sha256').update(`${challengeId}:${code}:${secret}`).digest('hex');
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

    const users = await selectRows('users', `select=id,tenant_id,role,status,email_verified,phone_verified&id=${eq(challenge.user_id)}&tenant_id=${eq(challenge.tenant_id)}&limit=1`);
    const tenants = await selectRows('tenants', `select=id,account_name,name,plan_code,plan_status,account_status,tenant_role,trial_ends_at&id=${eq(challenge.tenant_id)}&limit=1`);
    const user = users?.[0];
    const tenant = tenants?.[0];
    if (!user?.id || !tenant?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The account linked to this code is incomplete.' });

    const verifiedUserPatch = {
      status: 'active',
      email_verified: isEmail ? true : Boolean(user.email_verified),
      phone_verified: isEmail ? Boolean(user.phone_verified) : true,
      otp_test_last_verified_at: now,
      otp_test_status: isEmail ? 'verified_email' : 'verified_sms',
      last_login_at: now,
      updated_at: now
    };
    try {
      await updateRow('users', `id=${eq(user.id)}&tenant_id=${eq(tenant.id)}`, verifiedUserPatch);
    } catch (error) {
      if (!String(error.message || '').includes('last_login_at')) throw error;
      const { last_login_at, ...legacyPatch } = verifiedUserPatch;
      await updateRow('users', `id=${eq(user.id)}&tenant_id=${eq(tenant.id)}`, legacyPatch);
    }

    let planStatus = tenant.plan_status || 'trial_pending';
    let accountStatus = tenant.account_status || 'active';
    let trialEndsAt = tenant.trial_ends_at || null;
    if (accountStatus === 'pending_verification' || planStatus === 'signup_pending') {
      const plans = await selectRows('subscription_plans', `select=code,trial_days&code=${eq(tenant.plan_code || 'personal')}&limit=1`).catch(() => []);
      const trialDays = Math.max(0, Number(plans?.[0]?.trial_days ?? 14));
      trialEndsAt = trialDays ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null;
      planStatus = trialDays ? 'trial_active' : 'active';
      accountStatus = 'active';
      await updateRow('tenants', `id=${eq(tenant.id)}`, {
        status: 'active',
        account_status: accountStatus,
        plan_status: planStatus,
        trial_ends_at: trialEndsAt,
        updated_at: now
      });
      await insertRow('tenant_subscriptions', {
        id: publicId('subscription'),
        tenant_id: tenant.id,
        plan_code: tenant.plan_code || 'personal',
        status: trialDays ? 'trialing' : 'active',
        currency: 'GBP',
        price_minor: 0,
        trial_started_at: trialDays ? now : null,
        trial_ends_at: trialEndsAt,
        admin_override: false,
        metadata: { version: APP_VERSION, foundation_only: true }
      }).catch(() => null);
    }

    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: tenant.id,
      user_id: user.id,
      action: 'secure_customer_session_issued',
      metadata: { version: APP_VERSION, delivery_channel: challenge.delivery_channel }
    }).catch(() => null);

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      testMode: process.env.OTP_TEST_MODE === 'true',
      challengeId,
      tenantId: tenant.id,
      userId: user.id,
      role: user.role || 'administrator',
      authenticated: true,
      account: {
        accountName: tenant.account_name || tenant.name || '',
        planCode: tenant.plan_code || 'personal',
        planStatus,
        accountStatus,
        tenantRole: tenant.tenant_role || 'primary_owner',
        trialEndsAt
      },
      message: 'Account verified. Cloud backup and secure syncing are active on this device.'
    }, {
      'set-cookie': issueCustomerSession(event, { tenantId: tenant.id, userId: user.id, role: user.role || 'administrator' })
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not verify the code.', error: error.message, details: error.details || null });
  }
}
