import { insertRow, publicId, selectRows, updateRow, upsertRow } from './_db.js';
import { loadPlanEntitlementSnapshot } from './_entitlements.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export function isFounderTenant(tenant = {}) {
  const planCode = String(tenant.plan_code || '').toLowerCase();
  const planStatus = String(tenant.plan_status || '').toLowerCase();
  const tenantRole = String(tenant.tenant_role || '').toLowerCase();
  return planCode === 'founder_private'
    || planCode === 'private_founder'
    || planStatus === 'founder_active'
    || tenantRole === 'founder_first_tenant';
}

export function trialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return null;
  const remainingMs = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
}

export async function loadTenantSubscription(tenantId) {
  const rows = await selectRows('tenant_subscriptions', `select=*&tenant_id=${eq(tenantId)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

export async function upsertTrialSubscription({ tenant, trialStartedAt, trialEndsAt, status = 'trialing', metadata = {} }) {
  const existing = await loadTenantSubscription(tenant.id);
  const planCode = tenant.plan_code || 'personal';
  const entitlementSnapshot = existing?.entitlements_snapshot?.version
    ? existing.entitlements_snapshot
    : await loadPlanEntitlementSnapshot(planCode);
  const row = {
    id: existing?.id || publicId('subscription'),
    tenant_id: tenant.id,
    plan_code: planCode,
    status,
    billing_interval: existing?.billing_interval || null,
    currency: existing?.currency || 'GBP',
    price_minor: Number(existing?.price_minor || 0),
    trial_started_at: trialStartedAt || existing?.trial_started_at || null,
    trial_ends_at: trialEndsAt || null,
    current_period_start: existing?.current_period_start || null,
    current_period_end: existing?.current_period_end || null,
    cancel_at_period_end: status === 'cancelled' ? true : Boolean(existing?.cancel_at_period_end),
    cancelled_at: status === 'cancelled' ? new Date().toISOString() : null,
    grace_period_ends_at: existing?.grace_period_ends_at || null,
    provider: existing?.provider || null,
    provider_customer_id: existing?.provider_customer_id || null,
    provider_subscription_id: existing?.provider_subscription_id || null,
    provider_price_id: existing?.provider_price_id || null,
    last_payment_at: existing?.last_payment_at || null,
    last_payment_failed_at: existing?.last_payment_failed_at || null,
    admin_override: Boolean(existing?.admin_override),
    entitlements_snapshot: entitlementSnapshot,
    entitlements_snapshot_at: existing?.entitlements_snapshot_at || new Date().toISOString(),
    entitlement_overrides: existing?.entitlement_overrides || {},
    entitlement_override_note: existing?.entitlement_override_note || '',
    entitlement_override_updated_at: existing?.entitlement_override_updated_at || null,
    entitlement_override_updated_by: existing?.entitlement_override_updated_by || null,
    metadata: { ...(existing?.metadata || {}), ...metadata },
    updated_at: new Date().toISOString()
  };
  if (!existing?.id) row.created_at = new Date().toISOString();
  return upsertRow('tenant_subscriptions', row, 'tenant_id');
}

export async function recordLifecycleEvent({ tenantId, subscriptionId = null, eventType, status = 'recorded', metadata = {} }) {
  return insertRow('billing_events', {
    id: publicId('billing_event'),
    tenant_id: tenantId,
    subscription_id: subscriptionId,
    provider: null,
    provider_event_id: null,
    event_type: eventType,
    status,
    amount_minor: null,
    currency: 'GBP',
    metadata,
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  }).catch(() => null);
}

export async function evaluateTenantAccess(tenant) {
  if (!tenant?.id) return { allowed: false, code: 'ACCOUNT_NOT_FOUND', message: 'This account could not be found.' };
  if (isFounderTenant(tenant)) return { allowed: true, founder: true, tenant };

  const accountStatus = String(tenant.account_status || '').toLowerCase();
  const planStatus = String(tenant.plan_status || '').toLowerCase();
  const subscription = await loadTenantSubscription(tenant.id);
  const subscriptionStatus = String(subscription?.status || '').toLowerCase();

  if (['pending_verification', 'signup_pending'].includes(accountStatus) || planStatus === 'signup_pending') {
    return { allowed: false, code: 'ACCOUNT_VERIFICATION_REQUIRED', message: 'Verify your email before secure cloud features can be used.' };
  }
  if (accountStatus === 'suspended') {
    return { allowed: false, code: 'ACCOUNT_SUSPENDED', message: 'This account has been suspended. Please contact support.' };
  }

  if (subscription?.provider === 'stripe') {
    if (['active', 'trialing'].includes(subscriptionStatus)) {
      return {
        allowed: true,
        founder: false,
        paid: true,
        tenant,
        subscription,
        trialStartedAt: subscription.trial_started_at || tenant.trial_started_at || null,
        trialEndsAt: subscription.trial_ends_at || tenant.trial_ends_at || null,
        trialDaysRemaining: trialDaysRemaining(subscription.trial_ends_at || tenant.trial_ends_at)
      };
    }
    if (['past_due', 'unpaid'].includes(subscriptionStatus)) {
      const graceEndsAt = subscription.grace_period_ends_at || null;
      if (graceEndsAt && new Date(graceEndsAt).getTime() > Date.now()) {
        return { allowed: true, founder: false, paid: true, paymentProblem: true, tenant, subscription, gracePeriodEndsAt: graceEndsAt };
      }
      return { allowed: false, code: 'PAYMENT_REQUIRED', message: 'Your subscription payment needs attention. Open My Subscription to update your payment details.' };
    }
    if (['checkout_pending', 'checkout_cancelled', 'checkout_expired', 'incomplete'].includes(subscriptionStatus)) {
      const trialEndsAt = subscription.trial_ends_at || tenant.trial_ends_at || null;
      if (trialEndsAt && new Date(trialEndsAt).getTime() > Date.now()) {
        return { allowed: true, founder: false, paid: false, checkoutPending: subscriptionStatus === 'checkout_pending' || subscriptionStatus === 'incomplete', tenant, subscription, trialEndsAt, trialDaysRemaining: trialDaysRemaining(trialEndsAt) };
      }
      return { allowed: false, code: 'PAYMENT_REQUIRED', message: 'Complete your subscription to continue secure cloud backup and syncing. Your local encrypted vault remains available.' };
    }
    if (['paused', 'cancelled', 'canceled', 'incomplete_expired'].includes(subscriptionStatus)) {
      return { allowed: false, code: 'SUBSCRIPTION_INACTIVE', message: 'Your subscription is not active. Your local encrypted vault remains available; open My Subscription to manage billing.' };
    }
  }

  if (['cancelled', 'closed'].includes(accountStatus) || planStatus === 'trial_cancelled') {
    return { allowed: false, code: 'TRIAL_CANCELLED', message: 'This trial has been cancelled. Please contact support to reactivate the account.' };
  }
  if (accountStatus === 'trial_expired' || planStatus === 'trial_expired') {
    return { allowed: false, code: 'TRIAL_EXPIRED', message: 'Your free trial has ended. Your local encrypted vault remains available, but cloud backup and syncing are paused.' };
  }

  const trialEndsAt = tenant.trial_ends_at || null;
  const activeTrial = ['trial_active', 'trialing', 'trial_pending'].includes(planStatus);
  if (activeTrial && trialEndsAt && new Date(trialEndsAt).getTime() <= Date.now()) {
    const now = new Date().toISOString();
    await updateRow('tenants', `id=${eq(tenant.id)}`, {
      status: 'trial_expired',
      account_status: 'trial_expired',
      plan_status: 'trial_expired',
      updated_at: now
    }).catch(() => null);
    if (subscription?.id) {
      await updateRow('tenant_subscriptions', `id=${eq(subscription.id)}`, { status: 'expired', updated_at: now }).catch(() => null);
    }
    await recordLifecycleEvent({ tenantId: tenant.id, subscriptionId: subscription?.id || null, eventType: 'trial_expired', status: 'recorded', metadata: { trial_ends_at: trialEndsAt } });
    return { allowed: false, code: 'TRIAL_EXPIRED', message: 'Your free trial has ended. Your local encrypted vault remains available, but cloud backup and syncing are paused.' };
  }

  return {
    allowed: accountStatus === 'active' || !accountStatus,
    founder: false,
    tenant,
    subscription,
    trialStartedAt: tenant.trial_started_at || null,
    trialEndsAt,
    trialDaysRemaining: trialDaysRemaining(trialEndsAt)
  };
}
