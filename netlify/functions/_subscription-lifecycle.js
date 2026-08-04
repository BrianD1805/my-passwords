import { APP_VERSION, insertRow, publicId, selectRows, updateRow, upsertRow } from './_db.js';
import { billingIntervalDefinition, stripeObjectId, stripeRequest, stripeTimestampToIso } from './_stripe.js';

const ACTIVE_STRIPE_STATUSES = new Set(['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused']);
const SCHEDULE_ACTIVE_STATUSES = new Set(['not_started', 'active']);

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function metadataValue(object, key) {
  return String(object?.metadata?.[key] || '').trim();
}

export function internalSubscriptionStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'canceled') return 'cancelled';
  return value || 'incomplete';
}

export function subscriptionPeriod(subscription) {
  const firstItem = subscription?.items?.data?.[0] || null;
  return {
    start: stripeTimestampToIso(subscription?.current_period_start || firstItem?.current_period_start),
    end: stripeTimestampToIso(subscription?.current_period_end || firstItem?.current_period_end)
  };
}

export function subscriptionPrice(subscription) {
  const item = subscription?.items?.data?.[0] || null;
  const price = item?.price || item?.plan || null;
  return {
    id: stripeObjectId(price),
    itemId: stripeObjectId(item),
    currency: String(price?.currency || 'gbp').toUpperCase(),
    amountMinor: Number(price?.unit_amount ?? price?.amount ?? 0),
    interval: String(price?.recurring?.interval || ''),
    intervalCount: Number(price?.recurring?.interval_count || 1)
  };
}

function intervalFromRecurring(price) {
  if (price.interval === 'year' && price.intervalCount === 1) return 'annual';
  if (price.interval === 'month' && price.intervalCount === 3) return 'quarterly';
  if (price.interval === 'month' && price.intervalCount === 1) return 'monthly';
  return '';
}

async function loadPlanByCode(planCode) {
  if (!planCode) return null;
  const rows = await selectRows('subscription_plans', `select=*&code=${eq(planCode)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

async function loadPlanByPrice(priceId) {
  if (!priceId) return null;
  const encoded = encodeURIComponent(priceId);
  const rows = await selectRows('subscription_plans', `select=*&or=(stripe_monthly_price_id.eq.${encoded},stripe_quarterly_price_id.eq.${encoded},stripe_annual_price_id.eq.${encoded})&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

function intervalFromPlanPrice(plan, priceId) {
  if (!plan || !priceId) return '';
  if (plan.stripe_monthly_price_id === priceId) return 'monthly';
  if (plan.stripe_quarterly_price_id === priceId) return 'quarterly';
  if (plan.stripe_annual_price_id === priceId) return 'annual';
  return '';
}

async function loadTenant(tenantId) {
  const rows = await selectRows('tenants', `select=id,plan_code,plan_status,account_status,status,tenant_role,trial_started_at,trial_ends_at&id=${eq(tenantId)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

async function loadLocalSubscription(tenantId) {
  const rows = await selectRows('tenant_subscriptions', `select=*&tenant_id=${eq(tenantId)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

async function retrieveStripeSubscription(subscriptionId) {
  if (!subscriptionId) return null;
  return stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'GET',
    params: { expand: ['items.data.price', 'latest_invoice'] }
  });
}

export async function listCustomerStripeSubscriptions(customerId) {
  if (!customerId) return [];
  const result = await stripeRequest('subscriptions', {
    method: 'GET',
    params: {
      customer: customerId,
      status: 'all',
      limit: 100,
      expand: ['data.items.data.price', 'data.latest_invoice']
    }
  });
  return Array.isArray(result?.data) ? result.data : [];
}

function liveSubscriptions(subscriptions) {
  return (subscriptions || []).filter((subscription) => ACTIVE_STRIPE_STATUSES.has(String(subscription?.status || '').toLowerCase()));
}

async function listStripeCustomersForTenant(tenantId, preferredCustomerId = '') {
  const customers = [];
  const seen = new Set();
  const add = (customer) => {
    if (!customer?.id || customer.deleted || seen.has(customer.id)) return;
    seen.add(customer.id);
    customers.push(customer);
  };
  if (preferredCustomerId) add(await stripeRequest(`customers/${encodeURIComponent(preferredCustomerId)}`, { method: 'GET' }).catch(() => null));
  if (tenantId) {
    const query = `metadata['my_passwords_tenant_id']:'${String(tenantId).replace(/'/g, '')}'`;
    const result = await stripeRequest('customers/search', { method: 'GET', params: { query, limit: 100 } }).catch(() => null);
    for (const customer of result?.data || []) add(customer);
  }
  return customers;
}

function duplicateSubscriptionError(subscriptions) {
  const error = new Error('More than one live Stripe subscription exists for this account. No automatic change was made. Review the subscriptions in Stripe Dashboard, keep one subscription, then refresh again.');
  error.code = 'OVERLAPPING_SUBSCRIPTIONS';
  error.subscriptionIds = subscriptions.map((subscription) => subscription.id).filter(Boolean);
  return error;
}

export async function assertNoOverlappingStripeSubscriptions(customerId, allowedSubscriptionId = '') {
  if (!customerId) return { subscriptions: [], active: [] };
  const subscriptions = await listCustomerStripeSubscriptions(customerId);
  const active = liveSubscriptions(subscriptions);
  const unexpected = active.filter((subscription) => !allowedSubscriptionId || subscription.id !== allowedSubscriptionId);
  if (unexpected.length || active.length > 1) throw duplicateSubscriptionError(active);
  return { subscriptions, active };
}

async function retrieveSchedule(scheduleId) {
  if (!scheduleId) return null;
  return stripeRequest(`subscription_schedules/${encodeURIComponent(scheduleId)}`, {
    method: 'GET',
    params: { expand: ['phases.items.price'] }
  }).catch(() => null);
}

async function planForScheduledPhase(schedule, currentPriceId) {
  if (!schedule || !SCHEDULE_ACTIVE_STATUSES.has(String(schedule.status || '').toLowerCase())) return null;
  const targetCode = metadataValue(schedule, 'my_passwords_scheduled_plan_code');
  const targetInterval = metadataValue(schedule, 'my_passwords_scheduled_billing_interval');
  const targetPriceFromMetadata = metadataValue(schedule, 'my_passwords_scheduled_price_id');
  const phases = Array.isArray(schedule.phases) ? schedule.phases : [];
  const currentEnd = Number(schedule.current_phase?.end || 0);
  const futurePhase = phases.find((phase) => Number(phase.start_date || 0) >= currentEnd && stripeObjectId(phase?.items?.[0]?.price || phase?.items?.[0]?.plan) !== currentPriceId)
    || phases.find((phase) => Number(phase.start_date || 0) > Math.floor(Date.now() / 1000) && stripeObjectId(phase?.items?.[0]?.price || phase?.items?.[0]?.plan) !== currentPriceId)
    || null;
  const targetPriceId = targetPriceFromMetadata || stripeObjectId(futurePhase?.items?.[0]?.price || futurePhase?.items?.[0]?.plan);
  const plan = targetCode ? await loadPlanByCode(targetCode) : await loadPlanByPrice(targetPriceId);
  const interval = targetInterval || intervalFromPlanPrice(plan, targetPriceId) || intervalFromRecurring({
    interval: futurePhase?.items?.[0]?.price?.recurring?.interval,
    intervalCount: futurePhase?.items?.[0]?.price?.recurring?.interval_count
  });
  if (!targetPriceId && !plan?.code) return null;
  return {
    scheduleId: schedule.id,
    type: metadataValue(schedule, 'my_passwords_scheduled_change_type') || 'renewal_change',
    planCode: targetCode || plan?.code || '',
    billingInterval: interval || '',
    priceId: targetPriceId || '',
    amountMinor: Number(plan?.[billingIntervalDefinition(interval)?.amountColumn] || futurePhase?.items?.[0]?.price?.unit_amount || 0),
    currency: String(plan?.currency || futurePhase?.items?.[0]?.price?.currency || 'GBP').toUpperCase(),
    effectiveAt: stripeTimestampToIso(futurePhase?.start_date || schedule.current_phase?.end),
    createdAt: stripeTimestampToIso(schedule.created),
    status: schedule.status || ''
  };
}

function tenantLifecyclePatch(status, cancelAtPeriodEnd, tenant) {
  const accountSuspended = String(tenant?.account_status || '').toLowerCase() === 'suspended';
  if (accountSuspended) return { plan_status: 'suspended', account_status: 'suspended', status: 'suspended' };
  if (cancelAtPeriodEnd && ['active', 'trialing'].includes(status)) return { plan_status: 'cancellation_scheduled', account_status: 'active', status: 'active' };
  if (status === 'trialing') return { plan_status: 'trial_active', account_status: 'active', status: 'active' };
  if (status === 'active') return { plan_status: 'active', account_status: 'active', status: 'active' };
  if (['past_due', 'unpaid', 'incomplete'].includes(status)) return { plan_status: 'payment_problem', account_status: 'active', status: 'active' };
  if (status === 'paused') return { plan_status: 'payment_paused', account_status: 'active', status: 'active' };
  if (['cancelled', 'incomplete_expired'].includes(status)) return { plan_status: 'subscription_cancelled', account_status: 'cancelled', status: 'cancelled' };
  return { plan_status: status || tenant?.plan_status || 'active', account_status: tenant?.account_status || 'active', status: tenant?.status || 'active' };
}

export async function syncStripeSubscriptionObject(subscription, hints = {}) {
  const subscriptionId = stripeObjectId(subscription);
  const customerId = stripeObjectId(subscription?.customer) || hints.customerId || '';
  const price = subscriptionPrice(subscription);
  const pricePlan = await loadPlanByPrice(price.id);
  const tenantIdFromMetadata = metadataValue(subscription, 'my_passwords_tenant_id') || hints.tenantId || '';
  const existing = tenantIdFromMetadata ? await loadLocalSubscription(tenantIdFromMetadata) : null;
  const resolvedTenantId = tenantIdFromMetadata || existing?.tenant_id || hints.existing?.tenant_id || '';
  if (!resolvedTenantId) {
    const bySubscription = subscriptionId ? await selectRows('tenant_subscriptions', `select=*&provider_subscription_id=${eq(subscriptionId)}&limit=1`).catch(() => []) : [];
    const byCustomer = !bySubscription?.[0] && customerId ? await selectRows('tenant_subscriptions', `select=*&provider_customer_id=${eq(customerId)}&limit=1`).catch(() => []) : [];
    const matched = bySubscription?.[0] || byCustomer?.[0] || null;
    if (!matched?.tenant_id) throw new Error('Stripe subscription could not be matched to a My Passwords account.');
    return syncStripeSubscriptionObject(subscription, { ...hints, tenantId: matched.tenant_id, existing: matched });
  }

  const local = hints.existing || existing || await loadLocalSubscription(resolvedTenantId);
  const tenant = hints.tenant || await loadTenant(resolvedTenantId);
  const planCode = metadataValue(subscription, 'my_passwords_plan_code') || hints.planCode || pricePlan?.code || local?.plan_code || tenant?.plan_code || 'personal';
  const billingInterval = metadataValue(subscription, 'my_passwords_billing_interval') || hints.billingInterval || intervalFromPlanPrice(pricePlan, price.id) || intervalFromRecurring(price) || local?.billing_interval || null;
  const status = internalSubscriptionStatus(subscription?.status);
  const period = subscriptionPeriod(subscription);
  const now = new Date().toISOString();
  const trialEndsAt = stripeTimestampToIso(subscription?.trial_end) || local?.trial_ends_at || null;
  const failedAt = local?.last_payment_failed_at || null;
  const gracePeriodEndsAt = ['past_due', 'unpaid'].includes(status)
    ? (local?.grace_period_ends_at || new Date((failedAt ? new Date(failedAt).getTime() : Date.now()) + 7 * 86400000).toISOString())
    : null;
  const scheduleId = stripeObjectId(subscription?.schedule) || local?.stripe_schedule_id || '';
  const schedule = hints.schedule !== undefined ? hints.schedule : await retrieveSchedule(scheduleId);
  const scheduledChange = await planForScheduledPhase(schedule, price.id);
  const duplicateIds = Array.isArray(hints.duplicateSubscriptionIds) ? hints.duplicateSubscriptionIds : [];
  const latestInvoice = typeof subscription?.latest_invoice === 'object' ? subscription.latest_invoice : null;
  const latestInvoiceId = stripeObjectId(subscription?.latest_invoice) || local?.latest_invoice_id || null;

  const row = await upsertRow('tenant_subscriptions', {
    id: local?.id || publicId('subscription'),
    tenant_id: resolvedTenantId,
    plan_code: planCode,
    status,
    billing_interval: billingInterval,
    currency: price.currency || local?.currency || 'GBP',
    price_minor: price.amountMinor || Number(local?.price_minor || 0),
    trial_started_at: local?.trial_started_at || stripeTimestampToIso(subscription?.trial_start) || null,
    trial_ends_at: trialEndsAt,
    current_period_start: period.start,
    current_period_end: period.end,
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    cancelled_at: stripeTimestampToIso(subscription?.canceled_at) || (status === 'cancelled' ? now : null),
    grace_period_ends_at: gracePeriodEndsAt,
    provider: 'stripe',
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    provider_price_id: price.id || local?.provider_price_id || null,
    checkout_session_id: local?.checkout_session_id || hints.checkoutSessionId || null,
    latest_invoice_id: latestInvoiceId,
    last_payment_at: latestInvoice?.status === 'paid' ? (stripeTimestampToIso(latestInvoice?.status_transitions?.paid_at) || local?.last_payment_at || now) : local?.last_payment_at || null,
    last_payment_failed_at: ['past_due', 'unpaid'].includes(status) ? (local?.last_payment_failed_at || now) : local?.last_payment_failed_at || null,
    stripe_schedule_id: scheduledChange?.scheduleId || null,
    scheduled_plan_code: scheduledChange?.planCode || null,
    scheduled_billing_interval: scheduledChange?.billingInterval || null,
    scheduled_price_id: scheduledChange?.priceId || null,
    scheduled_change_at: scheduledChange?.effectiveAt || null,
    scheduled_change_type: scheduledChange?.type || null,
    scheduled_change_created_at: scheduledChange?.createdAt || null,
    duplicate_subscription_count: duplicateIds.length,
    duplicate_subscription_ids: duplicateIds,
    last_stripe_sync_at: now,
    last_stripe_sync_status: duplicateIds.length ? 'review_required' : 'ready',
    last_stripe_sync_message: duplicateIds.length ? 'Multiple live Stripe subscriptions require review.' : 'Stripe subscription status reconciled.',
    admin_override: false,
    metadata: { ...(local?.metadata || {}), version: APP_VERSION, stripe_status: subscription?.status || '', last_stripe_sync_at: now },
    created_at: local?.created_at || now,
    updated_at: now
  }, 'tenant_id');

  const lifecycle = tenantLifecyclePatch(status, Boolean(subscription?.cancel_at_period_end), tenant);
  await updateRow('tenants', `id=${eq(resolvedTenantId)}`, {
    plan_code: planCode,
    ...lifecycle,
    trial_ends_at: trialEndsAt,
    updated_at: now
  });
  return { row, scheduledChange, schedule };
}

async function previewUpcomingInvoice({ customerId, subscriptionId, scheduleId }) {
  if (!subscriptionId && !scheduleId) return null;
  const params = scheduleId ? { schedule: scheduleId } : { customer: customerId || undefined, subscription: subscriptionId };
  let invoice = await stripeRequest('invoices/create_preview', { params }).catch((error) => {
    if (error.status && error.status !== 404) throw error;
    return null;
  });
  if (!invoice) {
    invoice = await stripeRequest('invoices/upcoming', { method: 'GET', params: { customer: customerId || undefined, subscription: subscriptionId || undefined } }).catch(() => null);
  }
  if (!invoice) return null;
  return {
    amountDueMinor: Number(invoice.amount_due || 0),
    subtotalMinor: Number(invoice.subtotal || 0),
    totalMinor: Number(invoice.total || invoice.amount_due || 0),
    currency: String(invoice.currency || 'gbp').toUpperCase(),
    renewalAt: stripeTimestampToIso(invoice.next_payment_attempt || invoice.period_end || invoice.lines?.data?.[0]?.period?.end),
    description: invoice.description || '',
    lineCount: Number(invoice.lines?.data?.length || 0)
  };
}

async function listInvoiceHistory(customerId, subscriptionId) {
  if (!customerId) return [];
  const result = await stripeRequest('invoices', {
    method: 'GET',
    params: { customer: customerId, limit: 24 }
  });
  return (Array.isArray(result?.data) ? result.data : [])
    .filter((invoice) => {
      if (!subscriptionId) return true;
      const linked = stripeObjectId(invoice.subscription || invoice.parent?.subscription_details?.subscription);
      return !linked || linked === subscriptionId;
    })
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.number || '',
      status: invoice.status || '',
      billingReason: invoice.billing_reason || '',
      currency: String(invoice.currency || 'gbp').toUpperCase(),
      amountDueMinor: Number(invoice.amount_due || 0),
      amountPaidMinor: Number(invoice.amount_paid || 0),
      amountRemainingMinor: Number(invoice.amount_remaining || 0),
      createdAt: stripeTimestampToIso(invoice.created),
      dueAt: stripeTimestampToIso(invoice.due_date),
      paidAt: stripeTimestampToIso(invoice.status_transitions?.paid_at),
      hostedInvoiceUrl: invoice.hosted_invoice_url || '',
      invoicePdfUrl: invoice.invoice_pdf || ''
    }));
}

export function serializeSubscription(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    planCode: row.plan_code || 'personal',
    status: row.status || '',
    billingInterval: row.billing_interval || '',
    currency: row.currency || 'GBP',
    priceMinor: Number(row.price_minor || 0),
    trialStartedAt: row.trial_started_at || null,
    trialEndsAt: row.trial_ends_at || null,
    currentPeriodStart: row.current_period_start || null,
    currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    cancelledAt: row.cancelled_at || null,
    gracePeriodEndsAt: row.grace_period_ends_at || null,
    provider: row.provider || '',
    providerCustomerIdPresent: Boolean(row.provider_customer_id),
    providerSubscriptionIdPresent: Boolean(row.provider_subscription_id),
    lastPaymentAt: row.last_payment_at || null,
    lastPaymentFailedAt: row.last_payment_failed_at || null,
    stripeScheduleIdPresent: Boolean(row.stripe_schedule_id),
    scheduledChange: row.scheduled_change_at ? {
      type: row.scheduled_change_type || 'renewal_change',
      planCode: row.scheduled_plan_code || '',
      billingInterval: row.scheduled_billing_interval || '',
      effectiveAt: row.scheduled_change_at,
      amountMinor: Number(extras.scheduledChange?.amountMinor || 0),
      currency: extras.scheduledChange?.currency || row.currency || 'GBP'
    } : null,
    nextInvoice: extras.nextInvoice || (row.next_invoice_at || row.next_invoice_amount_minor ? {
      amountDueMinor: Number(row.next_invoice_amount_minor || 0),
      currency: row.next_invoice_currency || row.currency || 'GBP',
      renewalAt: row.next_invoice_at || row.current_period_end || null
    } : null),
    paymentHistory: extras.paymentHistory || [],
    duplicateSubscriptionCount: Number(row.duplicate_subscription_count || 0),
    duplicateSubscriptionIds: Array.isArray(row.duplicate_subscription_ids) ? row.duplicate_subscription_ids : [],
    lastStripeSyncAt: row.last_stripe_sync_at || null,
    lastStripeSyncStatus: row.last_stripe_sync_status || '',
    lastStripeSyncMessage: row.last_stripe_sync_message || ''
  };
}

async function recordBillingAction({ tenantId, subscriptionId, eventType, status = 'recorded', amountMinor = null, currency = 'GBP', metadata = {} }) {
  return insertRow('billing_events', {
    id: publicId('billing_event'),
    tenant_id: tenantId,
    subscription_id: subscriptionId || null,
    provider: 'stripe',
    provider_event_id: null,
    event_type: eventType,
    status,
    amount_minor: amountMinor,
    currency,
    metadata: { version: APP_VERSION, ...metadata },
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  }).catch(() => null);
}

async function resolveSubscriptionForContext(context) {
  const local = context.subscription || await loadLocalSubscription(context.tenant.id);
  const preferredCustomerId = String(local?.provider_customer_id || '').trim();
  const localSubscriptionId = String(local?.provider_subscription_id || '').trim();
  const customers = await listStripeCustomersForTenant(context.tenant.id, preferredCustomerId);
  const subscriptions = (await Promise.all(customers.map((customer) => listCustomerStripeSubscriptions(customer.id).catch(() => [])))).flat();
  const customerId = preferredCustomerId || customers[0]?.id || '';
  const active = liveSubscriptions(subscriptions);
  if (active.length > 1) {
    if (local?.id) {
      await updateRow('tenant_subscriptions', `id=${eq(local.id)}`, {
        duplicate_subscription_count: active.length,
        duplicate_subscription_ids: active.map((item) => item.id),
        last_stripe_sync_at: new Date().toISOString(),
        last_stripe_sync_status: 'review_required',
        last_stripe_sync_message: 'Multiple live Stripe subscriptions require review.',
        updated_at: new Date().toISOString()
      }).catch(() => null);
    }
    throw duplicateSubscriptionError(active);
  }
  let subscription = active[0] || null;
  if (!subscription && localSubscriptionId) subscription = await retrieveStripeSubscription(localSubscriptionId).catch(() => null);
  if (!subscription && subscriptions.length) subscription = subscriptions.find((item) => item.id === localSubscriptionId) || subscriptions[0];
  return { local, customerId, subscriptions, subscription };
}

export async function refreshStripeSubscriptionForContext(context, { recordEvent = true } = {}) {
  const resolved = await resolveSubscriptionForContext(context);
  if (!resolved.subscription?.id) {
    const local = resolved.local;
    if (local?.id) {
      const now = new Date().toISOString();
      const updated = await updateRow('tenant_subscriptions', `id=${eq(local.id)}`, {
        last_stripe_sync_at: now,
        last_stripe_sync_status: 'not_found',
        last_stripe_sync_message: 'No Stripe subscription was found for this billing profile.',
        duplicate_subscription_count: 0,
        duplicate_subscription_ids: [],
        updated_at: now
      });
      return { row: updated, subscription: serializeSubscription(updated), nextInvoice: null, paymentHistory: [], message: 'No Stripe subscription was found.' };
    }
    return { row: null, subscription: null, nextInvoice: null, paymentHistory: [], message: 'No Stripe subscription exists yet.' };
  }

  const synced = await syncStripeSubscriptionObject(resolved.subscription, { tenantId: context.tenant.id, tenant: context.tenant, existing: resolved.local });
  const subscriptionId = resolved.subscription.id;
  const customerId = stripeObjectId(resolved.subscription.customer) || resolved.customerId;
  const [nextInvoice, paymentHistory] = await Promise.all([
    previewUpcomingInvoice({ customerId, subscriptionId, scheduleId: synced.scheduledChange?.scheduleId || '' }).catch(() => null),
    listInvoiceHistory(customerId, subscriptionId).catch(() => [])
  ]);
  const now = new Date().toISOString();
  const updated = await updateRow('tenant_subscriptions', `id=${eq(synced.row.id)}`, {
    next_invoice_amount_minor: nextInvoice?.amountDueMinor ?? null,
    next_invoice_currency: nextInvoice?.currency || null,
    next_invoice_at: nextInvoice?.renewalAt || synced.row.current_period_end || null,
    duplicate_subscription_count: 0,
    duplicate_subscription_ids: [],
    last_stripe_sync_at: now,
    last_stripe_sync_status: 'ready',
    last_stripe_sync_message: 'Stripe status, renewal and invoice history refreshed.',
    updated_at: now
  });
  if (recordEvent) await recordBillingAction({ tenantId: context.tenant.id, subscriptionId: updated.id, eventType: 'subscription_reconciled_from_stripe', status: 'processed', metadata: { stripe_subscription_id: subscriptionId } });
  return {
    row: updated,
    subscription: serializeSubscription(updated, { scheduledChange: synced.scheduledChange, nextInvoice, paymentHistory }),
    nextInvoice,
    paymentHistory,
    message: 'Subscription status refreshed directly from Stripe.'
  };
}

function monthlyEquivalent(amountMinor, interval) {
  if (interval === 'annual') return Number(amountMinor || 0) / 12;
  if (interval === 'quarterly') return Number(amountMinor || 0) / 3;
  return Number(amountMinor || 0);
}

async function releaseSchedule(scheduleId) {
  if (!scheduleId) return null;
  return stripeRequest(`subscription_schedules/${encodeURIComponent(scheduleId)}/release`, { params: {} }).catch(() => null);
}

async function scheduleRenewalChange({ subscription, currentPlan, currentInterval, targetPlan, targetInterval, targetPriceId, tenantId, requestId = '' }) {
  const existingScheduleId = stripeObjectId(subscription.schedule);
  let schedule = existingScheduleId ? await retrieveSchedule(existingScheduleId) : null;
  if (!schedule?.id) {
    schedule = await stripeRequest('subscription_schedules', {
      params: {
        from_subscription: subscription.id,
        metadata: { my_passwords_tenant_id: tenantId }
      },
      idempotencyKey: `mp-schedule-${subscription.id}-${targetPlan.code}-${targetInterval}-${requestId || subscriptionPeriod(subscription).end || 'renewal'}`
    });
    schedule = await retrieveSchedule(schedule.id) || schedule;
  }
  const currentPrice = subscriptionPrice(subscription);
  const period = subscriptionPeriod(subscription);
  const currentDefinition = billingIntervalDefinition(currentInterval || intervalFromRecurring(currentPrice) || 'monthly');
  const targetDefinition = billingIntervalDefinition(targetInterval);
  const start = Math.floor(new Date(period.start || Date.now()).getTime() / 1000);
  const end = Math.floor(new Date(period.end || Date.now() + 86400000).getTime() / 1000);
  const changeType = currentPlan?.code === targetPlan.code ? 'billing_interval_change' : 'downgrade';
  const updatedSchedule = await stripeRequest(`subscription_schedules/${encodeURIComponent(schedule.id)}`, {
    params: {
      end_behavior: 'release',
      proration_behavior: 'none',
      metadata: {
        my_passwords_tenant_id: tenantId,
        my_passwords_scheduled_change_type: changeType,
        my_passwords_scheduled_plan_code: targetPlan.code,
        my_passwords_scheduled_billing_interval: targetInterval,
        my_passwords_scheduled_price_id: targetPriceId
      },
      phases: [
        {
          start_date: Number(schedule.current_phase?.start || start),
          end_date: Number(schedule.current_phase?.end || end),
          items: [{ price: currentPrice.id, quantity: 1 }],
          proration_behavior: 'none',
          metadata: {
            my_passwords_plan_code: currentPlan?.code || metadataValue(subscription, 'my_passwords_plan_code'),
            my_passwords_billing_interval: currentDefinition?.key || currentInterval || ''
          }
        },
        {
          items: [{ price: targetPriceId, quantity: 1 }],
          duration: { interval: targetDefinition.stripeInterval, interval_count: targetDefinition.intervalCount },
          proration_behavior: 'none',
          metadata: {
            my_passwords_plan_code: targetPlan.code,
            my_passwords_billing_interval: targetInterval
          }
        }
      ]
    }
  });
  return updatedSchedule;
}

export async function changeStripeSubscription(context, { planCode, billingInterval, requestId = '' }) {
  const targetPlan = await loadPlanByCode(String(planCode || '').trim().toLowerCase());
  const targetDefinition = billingIntervalDefinition(billingInterval);
  if (!targetPlan?.id || targetPlan.is_active === false || targetPlan.is_public === false) {
    const error = new Error('That subscription plan is not currently available.');
    error.code = 'PLAN_NOT_AVAILABLE';
    throw error;
  }
  if (!targetDefinition || !targetPlan[targetDefinition.priceColumn] || Number(targetPlan[targetDefinition.amountColumn] || 0) <= 0) {
    const error = new Error('The selected billing option is not available in Stripe yet.');
    error.code = 'PRICE_NOT_AVAILABLE';
    throw error;
  }

  const refreshed = await refreshStripeSubscriptionForContext(context, { recordEvent: false });
  const local = refreshed.row;
  const subscriptionId = String(local?.provider_subscription_id || '').trim();
  if (!subscriptionId) throw new Error('No active Stripe subscription was found.');
  const subscription = await retrieveStripeSubscription(subscriptionId);
  const status = internalSubscriptionStatus(subscription.status);
  if (!['active', 'trialing'].includes(status)) {
    const error = new Error('Resolve the current payment or subscription status before changing plans.');
    error.code = 'SUBSCRIPTION_NOT_CHANGEABLE';
    throw error;
  }
  if (subscription.cancel_at_period_end) {
    const error = new Error('Reactivate the subscription before choosing a different plan.');
    error.code = 'CANCELLATION_SCHEDULED';
    throw error;
  }

  const currentPlan = await loadPlanByCode(local.plan_code);
  const currentInterval = local.billing_interval || intervalFromRecurring(subscriptionPrice(subscription));
  if (currentPlan?.code === targetPlan.code && currentInterval === targetDefinition.key) return { ...refreshed, changeMode: 'none', message: 'This plan and billing period are already active.' };

  const currentMonthly = monthlyEquivalent(local.price_minor, currentInterval);
  const targetMonthly = monthlyEquivalent(targetPlan[targetDefinition.amountColumn], targetDefinition.key);
  const currentOrder = Number(currentPlan?.display_order || 0);
  const targetOrder = Number(targetPlan.display_order || 0);
  const differentPlan = targetPlan.code !== currentPlan?.code;
  const upgrade = differentPlan && (targetOrder > currentOrder || (targetOrder === currentOrder && targetMonthly > currentMonthly));
  let changeMode = 'scheduled';

  if (upgrade) {
    const scheduleId = stripeObjectId(subscription.schedule) || local.stripe_schedule_id || '';
    if (scheduleId) await releaseSchedule(scheduleId);
    const itemId = subscriptionPrice(subscription).itemId;
    await stripeRequest(`subscriptions/${encodeURIComponent(subscription.id)}`, {
      params: {
        items: [{ id: itemId, price: targetPlan[targetDefinition.priceColumn], quantity: 1 }],
        proration_behavior: 'create_prorations',
        metadata: {
          my_passwords_tenant_id: context.tenant.id,
          my_passwords_user_id: context.user.id,
          my_passwords_plan_code: targetPlan.code,
          my_passwords_billing_interval: targetDefinition.key
        }
      },
      idempotencyKey: `mp-upgrade-${subscription.id}-${targetPlan.code}-${targetDefinition.key}-${requestId || subscription.current_period_end || 'change'}`
    });
    changeMode = 'immediate';
  } else {
    await scheduleRenewalChange({
      subscription,
      currentPlan,
      currentInterval,
      targetPlan,
      targetInterval: targetDefinition.key,
      targetPriceId: targetPlan[targetDefinition.priceColumn],
      tenantId: context.tenant.id,
      requestId
    });
  }

  const result = await refreshStripeSubscriptionForContext(context, { recordEvent: false });
  await recordBillingAction({
    tenantId: context.tenant.id,
    subscriptionId: result.row?.id,
    eventType: changeMode === 'immediate' ? 'subscription_upgrade_applied' : 'subscription_change_scheduled',
    status: changeMode === 'immediate' ? 'processed' : 'scheduled',
    amountMinor: Number(targetPlan[targetDefinition.amountColumn] || 0),
    currency: targetPlan.currency || 'GBP',
    metadata: { from_plan_code: currentPlan?.code || '', to_plan_code: targetPlan.code, from_interval: currentInterval, to_interval: targetDefinition.key, effective_at: result.subscription?.scheduledChange?.effectiveAt || null }
  });
  return {
    ...result,
    changeMode,
    message: changeMode === 'immediate'
      ? `Your ${targetPlan.display_name} upgrade is active. Any proration will appear on the next Stripe invoice.`
      : `Your change to ${targetPlan.display_name} with ${targetDefinition.label.toLowerCase()} billing is scheduled for the next renewal.`
  };
}

export async function cancelStripeSubscriptionAtPeriodEnd(context, { requestId = '' } = {}) {
  const refreshed = await refreshStripeSubscriptionForContext(context, { recordEvent: false });
  const subscriptionId = String(refreshed.row?.provider_subscription_id || '').trim();
  if (!subscriptionId) throw new Error('No Stripe subscription was found.');
  const subscription = await retrieveStripeSubscription(subscriptionId);
  const status = internalSubscriptionStatus(subscription.status);
  if (['cancelled', 'incomplete_expired'].includes(status)) return { ...refreshed, message: 'This subscription has already ended.' };
  const scheduleId = stripeObjectId(subscription.schedule) || refreshed.row?.stripe_schedule_id || '';
  if (scheduleId) await releaseSchedule(scheduleId);
  await stripeRequest(`subscriptions/${encodeURIComponent(subscription.id)}`, {
    params: { cancel_at_period_end: true },
    idempotencyKey: `mp-cancel-period-end-${subscription.id}-${requestId || Date.now()}`
  });
  const result = await refreshStripeSubscriptionForContext(context, { recordEvent: false });
  await recordBillingAction({ tenantId: context.tenant.id, subscriptionId: result.row?.id, eventType: 'subscription_cancellation_scheduled', status: 'scheduled', metadata: { effective_at: result.row?.current_period_end || null } });
  return { ...result, message: `Cancellation is scheduled for ${result.row?.current_period_end ? new Date(result.row.current_period_end).toLocaleDateString('en-GB') : 'the end of the current billing period'}.` };
}

export async function reactivateStripeSubscription(context, { requestId = '' } = {}) {
  const refreshed = await refreshStripeSubscriptionForContext(context, { recordEvent: false });
  const subscriptionId = String(refreshed.row?.provider_subscription_id || '').trim();
  if (!subscriptionId) throw new Error('No Stripe subscription was found.');
  const subscription = await retrieveStripeSubscription(subscriptionId);
  const status = internalSubscriptionStatus(subscription.status);
  if (['cancelled', 'incomplete_expired'].includes(status)) {
    const error = new Error('This subscription has already ended. Choose a plan to start a new subscription.');
    error.code = 'SUBSCRIPTION_ENDED';
    throw error;
  }
  if (!subscription.cancel_at_period_end) return { ...refreshed, message: 'This subscription is already active and is not scheduled to cancel.' };
  await stripeRequest(`subscriptions/${encodeURIComponent(subscription.id)}`, {
    params: { cancel_at_period_end: false },
    idempotencyKey: `mp-reactivate-${subscription.id}-${requestId || Date.now()}`
  });
  const result = await refreshStripeSubscriptionForContext(context, { recordEvent: false });
  await recordBillingAction({ tenantId: context.tenant.id, subscriptionId: result.row?.id, eventType: 'subscription_reactivated', status: 'processed' });
  return { ...result, message: 'Cancellation removed. Your subscription will renew normally.' };
}

export async function processStripeInvoiceObject(invoice, paid) {
  const subscriptionId = stripeObjectId(invoice.subscription || invoice.parent?.subscription_details?.subscription);
  const customerId = stripeObjectId(invoice.customer);
  let local = null;
  if (subscriptionId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&provider_subscription_id=${eq(subscriptionId)}&limit=1`).catch(() => []);
    local = rows?.[0] || null;
  }
  if (!local && customerId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&provider_customer_id=${eq(customerId)}&limit=1`).catch(() => []);
    local = rows?.[0] || null;
  }
  if (subscriptionId) {
    const stripeSubscription = await retrieveStripeSubscription(subscriptionId).catch(() => null);
    if (stripeSubscription?.id) {
      const synced = await syncStripeSubscriptionObject(stripeSubscription, { tenantId: local?.tenant_id || '', customerId, existing: local });
      local = synced.row;
    }
  }
  if (!local?.id) throw new Error('Stripe invoice could not be matched to a My Passwords subscription.');
  const now = new Date().toISOString();
  const failedAt = paid ? null : now;
  const patch = paid
    ? { status: local.status === 'trialing' ? 'trialing' : 'active', latest_invoice_id: invoice.id, last_payment_at: stripeTimestampToIso(invoice.status_transitions?.paid_at) || now, last_payment_failed_at: null, grace_period_ends_at: null, updated_at: now }
    : { status: 'past_due', latest_invoice_id: invoice.id, last_payment_failed_at: failedAt, grace_period_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(), updated_at: now };
  const updated = await updateRow('tenant_subscriptions', `id=${eq(local.id)}`, patch);
  const tenant = await loadTenant(local.tenant_id);
  if (String(tenant?.account_status || '').toLowerCase() !== 'suspended') {
    await updateRow('tenants', `id=${eq(local.tenant_id)}`, paid
      ? { plan_status: local.cancel_at_period_end ? 'cancellation_scheduled' : 'active', account_status: 'active', status: 'active', updated_at: now }
      : { plan_status: 'payment_problem', account_status: 'active', status: 'active', updated_at: now });
  }
  return updated;
}

export async function refreshStripeSubscriptionForTenant(tenantId) {
  const tenant = await loadTenant(tenantId);
  const subscription = await loadLocalSubscription(tenantId);
  if (!tenant?.id) {
    const error = new Error('Customer account was not found.');
    error.code = 'TENANT_NOT_FOUND';
    throw error;
  }
  return refreshStripeSubscriptionForContext({ tenant, user: { id: '' }, subscription }, { recordEvent: true });
}
