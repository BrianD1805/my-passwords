import { APP_VERSION, deleteRow, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { readAdminSession } from './_auth.js';
import { isFounderTenant, loadTenantSubscription, recordLifecycleEvent, upsertTrialSubscription } from './_trial.js';
import { archiveStripePlan, stripeConfigured, syncStripePlan } from './_stripe.js';
import { refreshStripeSubscriptionForTenant } from './_subscription-lifecycle.js';
import { applyEntitlementOverrides, entitlementSnapshotFromPlan, normaliseEntitlementOverrides, normalisePlanFeatureFlags, reservedPlanCannotPublish, serialiseEntitlements } from './_entitlements.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function maskEmail(value) {
  const email = String(value || '');
  if (!email.includes('@')) return '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskPhone(value) {
  const phone = String(value || '');
  if (!phone) return '';
  return phone.length <= 7 ? `${phone.slice(0, 3)}***` : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

function toNonNegativeInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function cleanPlanCode(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

function cleanFeatures(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 30);
  return String(value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 30);
}

async function audit(action, metadata = {}) {
  await insertRow('audit_log', {
    id: publicId('audit'),
    tenant_id: metadata.tenant_id || null,
    user_id: null,
    action,
    metadata: { version: APP_VERSION, ...metadata }
  }).catch(() => null);
}

async function loadTenant(tenantId) {
  const rows = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at&id=${eq(tenantId)}&limit=1`);
  return rows?.[0] || null;
}

async function loadPlan(planCode) {
  const rows = await selectRows('subscription_plans', `select=*&code=${eq(planCode)}&limit=1`);
  return rows?.[0] || null;
}

async function ensureNonFounder(tenant) {
  if (!tenant?.id) return { ok: false, message: 'Customer account was not found.' };
  if (isFounderTenant(tenant)) return { ok: false, message: 'The Founder account is permanently active and cannot be placed into a normal trial lifecycle.' };
  return { ok: true };
}

async function loadDashboard() {
  const [plans, tenants, users, subscriptions, snapshots, syncEvents, billingEvents, documentBlobs] = await Promise.all([
    selectRows('subscription_plans', 'select=*&order=display_order.asc,display_name.asc'),
    selectRows('tenants', 'select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at,created_at,updated_at&order=created_at.desc&limit=250'),
    selectRows('users', 'select=id,tenant_id,email,phone_e164,display_name,role,status,email_verified,phone_verified,onboarding_status,onboarding_completed_at,welcome_email_sent_at,created_at&order=created_at.desc&limit=500'),
    selectRows('tenant_subscriptions', 'select=id,tenant_id,plan_code,status,billing_interval,currency,price_minor,trial_started_at,trial_ends_at,current_period_start,current_period_end,cancel_at_period_end,cancelled_at,grace_period_ends_at,admin_override,provider,provider_customer_id,provider_subscription_id,provider_price_id,checkout_session_id,latest_invoice_id,last_payment_at,last_payment_failed_at,stripe_schedule_id,scheduled_plan_code,scheduled_billing_interval,scheduled_price_id,scheduled_change_at,scheduled_change_type,scheduled_change_created_at,next_invoice_amount_minor,next_invoice_currency,next_invoice_at,last_stripe_sync_at,last_stripe_sync_status,last_stripe_sync_message,duplicate_subscription_count,duplicate_subscription_ids,entitlements_snapshot,entitlements_snapshot_at,entitlement_overrides,entitlement_override_note,entitlement_override_updated_at,entitlement_override_updated_by,updated_at&order=updated_at.desc&limit=250'),
    selectRows('vault_sync_snapshots', 'select=id,tenant_id,user_id,item_count,client_updated_at,created_at&order=created_at.desc&limit=1000'),
    selectRows('vault_sync_events', 'select=id,tenant_id,user_id,event_type,status,item_count,message,device_id,metadata,created_at&order=created_at.desc&limit=1000'),
    selectRows('billing_events', 'select=id,tenant_id,subscription_id,provider,provider_event_id,event_type,status,amount_minor,currency,metadata,occurred_at,created_at&order=created_at.desc&limit=500'),
    selectRows('document_blobs', 'select=id,tenant_id,file_size,storage_bytes&limit=5000').catch(() => [])
  ]);

  const usersByTenant = new Map();
  for (const user of users || []) {
    if (!usersByTenant.has(user.tenant_id)) usersByTenant.set(user.tenant_id, []);
    usersByTenant.get(user.tenant_id).push({
      id: user.id,
      displayName: user.display_name || '',
      email: user.email || '',
      phone: user.phone_e164 || '',
      emailMasked: maskEmail(user.email),
      phoneMasked: maskPhone(user.phone_e164),
      role: user.role || 'member',
      status: user.status || 'active',
      emailVerified: Boolean(user.email_verified),
      phoneVerified: Boolean(user.phone_verified),
      onboardingStatus: user.onboarding_status || '',
      onboardingCompletedAt: user.onboarding_completed_at || '',
      welcomeEmailSentAt: user.welcome_email_sent_at || '',
      createdAt: user.created_at
    });
  }
  const subscriptionsByTenant = new Map((subscriptions || []).map((subscription) => [subscription.tenant_id, subscription]));
  const latestSnapshotByTenant = new Map();
  for (const snapshot of snapshots || []) if (!latestSnapshotByTenant.has(snapshot.tenant_id)) latestSnapshotByTenant.set(snapshot.tenant_id, snapshot);
  const latestSyncEventByTenant = new Map();
  const syncEventCountsByTenant = new Map();
  for (const syncEvent of syncEvents || []) {
    if (!latestSyncEventByTenant.has(syncEvent.tenant_id)) latestSyncEventByTenant.set(syncEvent.tenant_id, syncEvent);
    syncEventCountsByTenant.set(syncEvent.tenant_id, Number(syncEventCountsByTenant.get(syncEvent.tenant_id) || 0) + 1);
  }
  const plansByCode = new Map((plans || []).map((plan) => [String(plan.code || '').toLowerCase(), plan]));
  const documentUsageByTenant = new Map();
  for (const document of documentBlobs || []) {
    const current = documentUsageByTenant.get(document.tenant_id) || { documents: 0, storageBytes: 0 };
    current.documents += 1;
    current.storageBytes += Math.max(0, Number(document.storage_bytes || document.file_size || 0));
    documentUsageByTenant.set(document.tenant_id, current);
  }
  const customerRows = (tenants || []).map((tenant) => {
    const subscription = subscriptionsByTenant.get(tenant.id) || null;
    const customerUsers = usersByTenant.get(tenant.id) || [];
    const plan = plansByCode.get(String(subscription?.plan_code || tenant.plan_code || 'personal').toLowerCase()) || null;
    const founder = isFounderTenant(tenant);
    const snapshot = subscription?.entitlements_snapshot?.version
      ? subscription.entitlements_snapshot
      : entitlementSnapshotFromPlan(founder ? {
          code: 'founder_private', display_name: 'Founder Plan', max_users: 1, document_limit: 0, storage_limit_mb: 0,
          feature_flags: { documents: true, emergencyAccess: true, secureDeviceUnlock: true, cloudBackupSync: true, multiUser: false, sharing: false }
        } : (plan || { code: tenant.plan_code || 'personal', display_name: tenant.plan_code || 'Personal', max_users: 1 }));
    const effectiveEntitlements = applyEntitlementOverrides(snapshot, subscription?.entitlement_overrides || {});
    const documentUsage = documentUsageByTenant.get(tenant.id) || { documents: 0, storageBytes: 0 };
    const usage = { users: customerUsers.filter((user) => !['cancelled', 'deleted'].includes(String(user.status || '').toLowerCase())).length, ...documentUsage };
    return {
      id: tenant.id,
      accountName: tenant.account_name || tenant.name || '',
      planCode: tenant.plan_code || 'personal',
      planStatus: tenant.plan_status || 'trial_pending',
      accountStatus: tenant.account_status || 'active',
      tenantRole: tenant.tenant_role || 'primary_owner',
      trialStartedAt: tenant.trial_started_at || subscription?.trial_started_at || '',
      trialEndsAt: tenant.trial_ends_at || subscription?.trial_ends_at || '',
      onboardingCompletedAt: tenant.onboarding_completed_at || '',
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
      users: customerUsers,
      subscription,
      entitlements: serialiseEntitlements(effectiveEntitlements, usage),
      entitlementOverrides: normaliseEntitlementOverrides(subscription?.entitlement_overrides || {}),
      entitlementOverrideNote: subscription?.entitlement_override_note || '',
      entitlementOverrideUpdatedAt: subscription?.entitlement_override_updated_at || '',
      entitlementOverrideUpdatedBy: subscription?.entitlement_override_updated_by || '',
      billingEvents: (billingEvents || []).filter((event) => event.tenant_id === tenant.id).slice(0, 20),
      syncDiagnostics: {
        latestSnapshot: latestSnapshotByTenant.get(tenant.id) || null,
        latestEvent: latestSyncEventByTenant.get(tenant.id) || null,
        eventCount: Number(syncEventCountsByTenant.get(tenant.id) || 0)
      }
    };
  });

  return {
    plans: plans || [],
    customers: customerRows,
    billingEvents: billingEvents || [],
    stripeConfigured: stripeConfigured(),
    summary: {
      tenants: customerRows.length,
      activeAccounts: customerRows.filter((row) => row.accountStatus === 'active').length,
      trials: customerRows.filter((row) => ['trial_active', 'trialing'].includes(String(row.planStatus))).length,
      expiredTrials: customerRows.filter((row) => row.planStatus === 'trial_expired').length,
      pendingSignups: customerRows.filter((row) => row.planStatus === 'signup_pending').length,
      publishedPlans: (plans || []).filter((plan) => plan.is_public && plan.is_active).length,
      syncIssues: customerRows.filter((row) => ['warning', 'error'].includes(String(row.syncDiagnostics?.latestEvent?.status || '').toLowerCase())).length,
      paidSubscriptions: customerRows.filter((row) => row.subscription?.provider === 'stripe' && ['active', 'trialing'].includes(String(row.subscription?.status || '').toLowerCase())).length,
      paymentProblems: customerRows.filter((row) => ['past_due', 'unpaid'].includes(String(row.subscription?.status || '').toLowerCase())).length
    }
  };
}

export async function handler(event) {
  if (!readAdminSession(event)) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'ADMIN_SESSION_REQUIRED', message: 'Admin sign-in is required.' });

  if (event.httpMethod === 'GET') {
    try {
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await loadDashboard()) });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load admin data. Run all required Supabase migrations through Ver-0.044.', error: error.message, details: error.details || null });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const body = parseBody(event);
  const action = String(body.action || '').trim();

  try {
    if (action === 'save_plan') {
      const plan = body.plan || {};
      const code = cleanPlanCode(plan.code);
      const displayName = String(plan.displayName || '').trim();
      if (!code || !displayName) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Plan code and display name are required.' });
      const existing = await selectRows('subscription_plans', `select=id,code&code=${eq(code)}&limit=1`);
      const row = {
        code,
        display_name: displayName,
        description: String(plan.description || '').trim(),
        currency: 'GBP',
        monthly_price_minor: toNonNegativeInt(plan.monthlyPriceMinor),
        quarterly_price_minor: toNonNegativeInt(plan.quarterlyPriceMinor),
        annual_price_minor: toNonNegativeInt(plan.annualPriceMinor),
        trial_days: toNonNegativeInt(plan.trialDays),
        max_users: Math.max(1, toNonNegativeInt(plan.maxUsers) || 1),
        storage_limit_mb: toNonNegativeInt(plan.storageLimitMb),
        document_limit: toNonNegativeInt(plan.documentLimit),
        features: reservedPlanCannotPublish(code) ? [] : cleanFeatures(plan.features),
        feature_flags: {
          ...normalisePlanFeatureFlags(plan.featureFlags || {}),
          multiUser: false,
          sharing: false
        },
        entitlement_version: 1,
        is_featured: reservedPlanCannotPublish(code) ? false : Boolean(plan.isFeatured),
        is_public: reservedPlanCannotPublish(code) ? false : Boolean(plan.isPublic),
        is_active: plan.isActive !== false,
        display_order: toNonNegativeInt(plan.displayOrder),
        updated_at: new Date().toISOString()
      };
      let saved;
      if (existing?.[0]?.id) saved = await updateRow('subscription_plans', `id=${eq(existing[0].id)}`, row);
      else saved = await insertRow('subscription_plans', { id: publicId('plan'), ...row });
      const stripeSync = await syncStripePlan(saved);
      await audit('subscription_plan_saved', { plan_code: code, stripe_sync_status: stripeSync.plan?.stripe_sync_status || '' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, plan: stripeSync.plan || saved, stripeConfigured: stripeSync.configured, stripeSynced: Boolean(stripeSync.ok), message: reservedPlanCannotPublish(code) ? 'Plan saved as hidden. Family and Business stay unpublished until their advertised functionality is built.' : (stripeSync.message || 'Subscription plan saved.') });
    }


    if (action === 'sync_stripe_plan') {
      const code = cleanPlanCode(body.planCode);
      const plan = await loadPlan(code);
      if (!plan?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Subscription plan was not found.' });
      const stripeSync = await syncStripePlan(plan);
      await audit('subscription_plan_stripe_sync_requested', { plan_code: code, stripe_sync_status: stripeSync.plan?.stripe_sync_status || '' });
      return jsonResponse(stripeSync.ok ? 200 : 409, { ok: Boolean(stripeSync.ok), version: APP_VERSION, plan: stripeSync.plan || plan, stripeConfigured: stripeSync.configured, message: stripeSync.message });
    }

    if (action === 'delete_plan') {
      const code = cleanPlanCode(body.planCode);
      const plan = await loadPlan(code);
      if (!plan?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Subscription plan was not found.' });
      const [tenantUsers, subscriptionUsers] = await Promise.all([
        selectRows('tenants', `select=id&plan_code=${eq(code)}&limit=1`),
        selectRows('tenant_subscriptions', `select=id&plan_code=${eq(code)}&limit=1`)
      ]);
      if (tenantUsers?.length || subscriptionUsers?.length) {
        return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'This plan cannot be deleted because one or more customer accounts or subscriptions still use it. Hide or deactivate it instead.' });
      }
      const archived = await archiveStripePlan(plan);
      if (!archived.ok) return jsonResponse(409, { ok: false, version: APP_VERSION, message: archived.message });
      await deleteRow('subscription_plans', `id=${eq(plan.id)}`);
      await audit('subscription_plan_deleted', { plan_code: code, stripe_archived: Boolean(archived.configured) });
      return jsonResponse(200, { ok: true, version: APP_VERSION, message: 'Subscription plan deleted. Any Stripe Product and Prices were archived.' });
    }

    if (action === 'save_entitlement_overrides') {
      const tenantId = String(body.tenantId || '').trim();
      if (!tenantId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A customer account is required.' });
      const tenant = await loadTenant(tenantId);
      if (!tenant?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Customer account was not found.' });
      let subscription = await loadTenantSubscription(tenantId);
      if (!subscription?.id && !isFounderTenant(tenant)) {
        subscription = await upsertTrialSubscription({
          tenant,
          trialStartedAt: tenant.trial_started_at || null,
          trialEndsAt: tenant.trial_ends_at || null,
          status: String(tenant.plan_status || '').includes('trial') ? 'trialing' : 'active',
          metadata: { version: APP_VERSION, entitlement_override_record_created: true }
        });
      }
      if (!subscription?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Admin overrides are not required for the Founder account.' });
      const overrides = normaliseEntitlementOverrides(body.overrides || {});
      overrides.features.multiUser = false;
      overrides.features.sharing = false;
      const note = String(body.note || '').trim().slice(0, 500);
      const now = new Date().toISOString();
      const cleared = !Object.keys(overrides.features).length && Object.values(overrides.limits).every((value) => value === null);
      const updated = await updateRow('tenant_subscriptions', `id=${eq(subscription.id)}`, {
        entitlement_overrides: cleared ? {} : overrides,
        entitlement_override_note: cleared ? '' : note,
        entitlement_override_updated_at: now,
        entitlement_override_updated_by: 'platform_admin',
        updated_at: now
      });
      await audit(cleared ? 'tenant_entitlement_overrides_cleared' : 'tenant_entitlement_overrides_saved', { tenant_id: tenantId, overrides: cleared ? {} : overrides, note: cleared ? '' : note });
      return jsonResponse(200, { ok: true, version: APP_VERSION, subscription: updated, overrides: cleared ? {} : overrides, message: cleared ? 'Plan entitlement overrides cleared.' : 'Plan entitlement overrides saved.' });
    }

    if (action === 'refresh_stripe_subscription') {
      const tenantId = String(body.tenantId || '').trim();
      if (!tenantId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A customer account is required.' });
      const tenant = await loadTenant(tenantId);
      if (!tenant?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Customer account was not found.' });
      if (isFounderTenant(tenant)) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Founder access does not use Stripe Billing.' });
      const result = await refreshStripeSubscriptionForTenant(tenantId);
      await audit('stripe_subscription_refreshed_by_admin', { tenant_id: tenantId, stripe_subscription_id: result.row?.provider_subscription_id || '', status: result.row?.status || '' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, subscription: result.row || null, message: result.message || 'Stripe subscription refreshed.' });
    }

    if (action === 'set_account_status') {
      const tenantId = String(body.tenantId || '').trim();
      const accountStatus = String(body.accountStatus || '').trim().toLowerCase();
      if (!tenantId || !['active', 'suspended'].includes(accountStatus)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A valid tenant and account status are required.' });
      const tenantCurrent = await loadTenant(tenantId);
      if (isFounderTenant(tenantCurrent) && accountStatus === 'suspended') return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The Founder account cannot be suspended.' });
      const tenant = await updateRow('tenants', `id=${eq(tenantId)}`, { account_status: accountStatus, status: accountStatus, updated_at: new Date().toISOString() });
      await audit('tenant_account_status_changed', { tenant_id: tenantId, account_status: accountStatus });
      return jsonResponse(200, { ok: true, version: APP_VERSION, tenant, message: accountStatus === 'suspended' ? 'Account suspended.' : 'Account activated.' });
    }

    if (['start_trial', 'extend_trial', 'activate_account', 'cancel_trial'].includes(action)) {
      const tenantId = String(body.tenantId || '').trim();
      const tenant = await loadTenant(tenantId);
      const allowed = await ensureNonFounder(tenant);
      if (!allowed.ok) return jsonResponse(409, { ok: false, version: APP_VERSION, message: allowed.message });
      const currentSubscription = await loadTenantSubscription(tenantId);
      if (currentSubscription?.provider === 'stripe' && currentSubscription?.provider_subscription_id) {
        return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'This account is managed by Stripe Billing. Use Stripe Dashboard or the customer billing portal for subscription changes.' });
      }
      const plan = await loadPlan(tenant.plan_code || 'personal');
      if (!plan?.code) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The customer plan could not be found.' });
      const now = new Date();
      const nowIso = now.toISOString();

      if (action === 'start_trial') {
        const days = Math.max(0, Number(body.days ?? plan.trial_days ?? 0));
        const trialStartedAt = nowIso;
        const trialEndsAt = days ? new Date(now.getTime() + days * 86400000).toISOString() : null;
        const updated = await updateRow('tenants', `id=${eq(tenantId)}`, { status: 'active', account_status: 'active', plan_status: days ? 'trial_active' : 'active', trial_started_at: trialStartedAt, trial_ends_at: trialEndsAt, onboarding_completed_at: tenant.onboarding_completed_at || nowIso, updated_at: nowIso });
        const subscription = await upsertTrialSubscription({ tenant, trialStartedAt, trialEndsAt, status: days ? 'trialing' : 'active', metadata: { version: APP_VERSION, admin_started: true } });
        await recordLifecycleEvent({ tenantId, subscriptionId: subscription?.id || null, eventType: 'trial_started_by_admin', metadata: { days, trial_ends_at: trialEndsAt } });
        await audit('trial_started_by_admin', { tenant_id: tenantId, days, trial_ends_at: trialEndsAt });
        return jsonResponse(200, { ok: true, version: APP_VERSION, tenant: updated, message: days ? `Trial started for ${days} days.` : 'Account activated without a trial.' });
      }

      if (action === 'extend_trial') {
        const days = Math.min(365, Math.max(1, Number(body.days || 7)));
        const currentEnd = tenant.trial_ends_at ? new Date(tenant.trial_ends_at) : now;
        const base = currentEnd.getTime() > now.getTime() ? currentEnd : now;
        const trialStartedAt = tenant.trial_started_at || nowIso;
        const trialEndsAt = new Date(base.getTime() + days * 86400000).toISOString();
        const updated = await updateRow('tenants', `id=${eq(tenantId)}`, { status: 'active', account_status: 'active', plan_status: 'trial_active', trial_started_at: trialStartedAt, trial_ends_at: trialEndsAt, updated_at: nowIso });
        const subscription = await upsertTrialSubscription({ tenant, trialStartedAt, trialEndsAt, status: 'trialing', metadata: { version: APP_VERSION, last_admin_extension_days: days, last_admin_extension_at: nowIso } });
        await recordLifecycleEvent({ tenantId, subscriptionId: subscription?.id || null, eventType: 'trial_extended_by_admin', metadata: { days, trial_ends_at: trialEndsAt } });
        await audit('trial_extended_by_admin', { tenant_id: tenantId, days, trial_ends_at: trialEndsAt });
        return jsonResponse(200, { ok: true, version: APP_VERSION, tenant: updated, message: `Trial extended by ${days} day${days === 1 ? '' : 's'}.` });
      }

      if (action === 'activate_account') {
        const updated = await updateRow('tenants', `id=${eq(tenantId)}`, { status: 'active', account_status: 'active', plan_status: 'active', trial_ends_at: null, updated_at: nowIso });
        const existing = await loadTenantSubscription(tenantId);
        if (existing?.id) await updateRow('tenant_subscriptions', `id=${eq(existing.id)}`, { status: 'active', trial_ends_at: null, admin_override: true, updated_at: nowIso });
        await recordLifecycleEvent({ tenantId, subscriptionId: existing?.id || null, eventType: 'account_activated_by_admin', metadata: { admin_override: true } });
        await audit('account_activated_by_admin', { tenant_id: tenantId });
        return jsonResponse(200, { ok: true, version: APP_VERSION, tenant: updated, message: 'Account activated by Admin.' });
      }

      if (action === 'cancel_trial') {
        const updated = await updateRow('tenants', `id=${eq(tenantId)}`, { status: 'cancelled', account_status: 'cancelled', plan_status: 'trial_cancelled', updated_at: nowIso });
        const existing = await loadTenantSubscription(tenantId);
        if (existing?.id) await updateRow('tenant_subscriptions', `id=${eq(existing.id)}`, { status: 'cancelled', cancel_at_period_end: true, cancelled_at: nowIso, updated_at: nowIso });
        await recordLifecycleEvent({ tenantId, subscriptionId: existing?.id || null, eventType: 'trial_cancelled_by_admin', metadata: { cancelled_at: nowIso } });
        await audit('trial_cancelled_by_admin', { tenant_id: tenantId });
        return jsonResponse(200, { ok: true, version: APP_VERSION, tenant: updated, message: 'Trial cancelled. Local encrypted vault access remains on the customer device, while cloud features are paused.' });
      }
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown admin action.' });
  } catch (error) {
    const overlapping = error?.code === 'OVERLAPPING_SUBSCRIPTIONS';
    return jsonResponse(overlapping ? 409 : 500, {
      ok: false,
      version: APP_VERSION,
      code: error.code || 'ADMIN_UPDATE_FAILED',
      message: overlapping ? error.message : `Admin update failed. ${error.message || 'Please try again.'}`,
      duplicateSubscriptionIds: error.subscriptionIds || [],
      details: error.details || null
    });
  }
}
