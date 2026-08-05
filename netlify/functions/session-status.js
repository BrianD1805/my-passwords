import { APP_VERSION, jsonResponse, parseBody, selectRows } from './_db.js';
import { clearCustomerSession } from './_auth.js';
import { revokeSession, upgradeOrRenewCustomerSession, validateCustomerSession } from './_account-session.js';
import { evaluateTenantAccess, loadTenantSubscription, trialDaysRemaining } from './_trial.js';
import { stripeConfigured } from './_stripe.js';
import { serializeSubscription } from './_subscription-lifecycle.js';
import { resolveTenantEntitlements } from './_entitlements.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const body = event.httpMethod === 'POST' ? parseBody(event) : {};
  const action = String(body.action || 'status').trim();

  if (action === 'logout') {
    const validation = await validateCustomerSession(event, { touch: false });
    if (validation.ok && validation.session?.sessionId) await revokeSession(validation.session.sessionId, 'ended_on_device').catch(() => null);
    return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, cloudAccess: false, message: 'Device verification ended.' }, { 'set-cookie': clearCustomerSession(event) });
  }

  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) {
    return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, cloudAccess: false, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verify this device to enable secure backup and syncing.' }, { 'set-cookie': clearCustomerSession(event) });
  }
  const session = validation.session;

  try {
    const users = await selectRows('users', `select=id,tenant_id,display_name,email,phone_e164,role,status,email_verified,phone_verified,session_generation&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
    const tenants = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at,deletion_status,deletion_requested_at,deletion_scheduled_for&id=${eq(session.tenantId)}&limit=1`);
    const user = users?.[0];
    const tenant = tenants?.[0];
    if (!user?.id || !tenant?.id || String(user.status || '').toLowerCase() === 'suspended') {
      return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, cloudAccess: false, code: 'SESSION_INVALID', message: 'This device verification is no longer active.' }, { 'set-cookie': clearCustomerSession(event) });
    }

    const renewed = await upgradeOrRenewCustomerSession(event, validation, {
      role: user.role || session.role || 'member',
      clientDeviceId: body.clientDeviceId,
      deviceName: body.deviceName,
      deviceType: body.deviceType,
      platform: body.platform,
      browser: body.browser,
      userAgent: body.userAgent
    });
    const activeSession = renewed?.session || validation.stored || null;
    const activeDevice = renewed?.device || validation.device || null;

    const lifecycle = await evaluateTenantAccess(tenant);
    const subscription = await loadTenantSubscription(tenant.id);
    const entitlementContext = await resolveTenantEntitlements(tenant.id);
    const trialStartedAt = tenant.trial_started_at || subscription?.trial_started_at || null;
    const trialEndsAt = tenant.trial_ends_at || subscription?.trial_ends_at || null;
    const backupIncluded = entitlementContext.effective.features.cloudBackupSync !== false;
    const cloudAccess = Boolean(lifecycle.allowed && backupIncluded);
    const accessCode = lifecycle.allowed && !backupIncluded ? 'PLAN_FEATURE_REQUIRED' : (cloudAccess ? '' : lifecycle.code || 'ACCOUNT_ACCESS_PAUSED');
    const accessMessage = lifecycle.allowed && !backupIncluded
      ? 'Cloud backup and syncing are not included in this plan. Your local encrypted vault remains available.'
      : (cloudAccess ? 'This device is verified for secure backup and syncing.' : lifecycle.message);

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      authenticated: true,
      cloudAccess,
      accessCode,
      tenantId: tenant.id,
      userId: user.id,
      role: user.role || session.role || 'member',
      stripeConfigured: stripeConfigured(),
      subscription: serializeSubscription(subscription),
      entitlements: entitlementContext.serialized,
      session: {
        id: activeSession?.id || session.sessionId || '',
        deviceId: activeDevice?.id || session.deviceId || '',
        deviceName: activeDevice?.device_name || body.deviceName || 'Verified device',
        issuedAt: activeSession?.issued_at || (session.iat ? new Date(session.iat * 1000).toISOString() : ''),
        expiresAt: renewed?.expiresAt || activeSession?.expires_at || (session.exp ? new Date(session.exp * 1000).toISOString() : ''),
        renewed: Boolean(renewed),
        legacyUpgraded: Boolean(validation.legacy)
      },
      deletion: {
        status: tenant.deletion_status || 'none',
        requestedAt: tenant.deletion_requested_at || null,
        scheduledFor: tenant.deletion_scheduled_for || null
      },
      account: {
        displayName: user.display_name || '',
        email: user.email || '',
        emailVerified: Boolean(user.email_verified),
        phoneE164: user.phone_e164 || '',
        phoneVerified: Boolean(user.phone_verified),
        accountName: tenant.account_name || tenant.name || '',
        planCode: tenant.plan_code || 'personal',
        planStatus: tenant.plan_status || 'trial_pending',
        accountStatus: tenant.account_status || 'active',
        tenantRole: tenant.tenant_role || 'primary_owner',
        trialStartedAt,
        trialEndsAt,
        trialDaysRemaining: trialDaysRemaining(trialEndsAt),
        onboardingCompletedAt: tenant.onboarding_completed_at || null
      },
      message: accessMessage
    }, renewed?.cookie ? { 'set-cookie': renewed.cookie } : {});
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, authenticated: false, cloudAccess: false, message: 'Could not check device verification.', error: error.message, details: error.details || null });
  }
}
