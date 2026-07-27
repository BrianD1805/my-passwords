import { APP_VERSION, insertRow, jsonResponse, publicId, selectRows, updateRow, upsertRow } from './_db.js';
import { stripeObjectId, stripeRequest, stripeTimestampToIso, stripeWebhookConfigured, verifyStripeWebhook } from './_stripe.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function rawRequestBody(event) {
  return event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : String(event.body || '');
}

function metadataValue(object, key) {
  return String(object?.metadata?.[key] || '');
}

function subscriptionPeriod(subscription) {
  const firstItem = subscription?.items?.data?.[0] || null;
  return {
    start: stripeTimestampToIso(subscription?.current_period_start || firstItem?.current_period_start),
    end: stripeTimestampToIso(subscription?.current_period_end || firstItem?.current_period_end)
  };
}

function subscriptionPrice(subscription) {
  const price = subscription?.items?.data?.[0]?.price || null;
  return {
    id: stripeObjectId(price),
    amountMinor: Number(price?.unit_amount || 0),
    currency: String(price?.currency || 'gbp').toUpperCase()
  };
}

function internalStatus(stripeStatus) {
  const value = String(stripeStatus || '').toLowerCase();
  if (value === 'trialing') return { subscription: 'trialing', plan: 'trial_active', account: 'active' };
  if (value === 'active') return { subscription: 'active', plan: 'active', account: 'active' };
  if (['past_due', 'unpaid'].includes(value)) return { subscription: value, plan: 'payment_problem', account: 'active' };
  if (value === 'paused') return { subscription: 'paused', plan: 'payment_paused', account: 'payment_paused' };
  if (['canceled', 'incomplete_expired'].includes(value)) return { subscription: 'cancelled', plan: 'subscription_cancelled', account: 'cancelled' };
  if (value === 'incomplete') return { subscription: 'incomplete', plan: 'checkout_pending', account: 'active' };
  return { subscription: value || 'pending', plan: value || 'pending', account: 'active' };
}

async function findPlanByPrice(priceId) {
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

async function findSubscriptionRow({ tenantId = '', subscriptionId = '', customerId = '' }) {
  if (tenantId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&tenant_id=${eq(tenantId)}&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (subscriptionId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&provider_subscription_id=${eq(subscriptionId)}&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (customerId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&provider_customer_id=${eq(customerId)}&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function applySubscription(subscription, hints = {}) {
  const subscriptionId = stripeObjectId(subscription);
  const customerId = stripeObjectId(subscription?.customer) || hints.customerId || '';
  const price = subscriptionPrice(subscription);
  const plan = await findPlanByPrice(price.id);
  const tenantId = metadataValue(subscription, 'my_passwords_tenant_id') || hints.tenantId || '';
  const existing = await findSubscriptionRow({ tenantId, subscriptionId, customerId });
  const resolvedTenantId = tenantId || existing?.tenant_id || '';
  if (!resolvedTenantId) throw new Error('Stripe subscription could not be matched to a My Passwords account.');
  const planCode = metadataValue(subscription, 'my_passwords_plan_code') || hints.planCode || plan?.code || existing?.plan_code || 'personal';
  const billingInterval = metadataValue(subscription, 'my_passwords_billing_interval') || hints.billingInterval || intervalFromPlanPrice(plan, price.id) || existing?.billing_interval || null;
  const status = internalStatus(subscription?.status);
  const period = subscriptionPeriod(subscription);
  const now = new Date().toISOString();
  const trialEndsAt = stripeTimestampToIso(subscription?.trial_end) || existing?.trial_ends_at || null;
  const gracePeriodEndsAt = ['past_due', 'unpaid'].includes(status.subscription)
    ? (existing?.grace_period_ends_at || new Date(Date.now() + 7 * 86400000).toISOString())
    : null;

  const row = await upsertRow('tenant_subscriptions', {
    id: existing?.id || publicId('subscription'),
    tenant_id: resolvedTenantId,
    plan_code: planCode,
    status: status.subscription,
    billing_interval: billingInterval,
    currency: price.currency || existing?.currency || 'GBP',
    price_minor: price.amountMinor || Number(existing?.price_minor || 0),
    trial_started_at: existing?.trial_started_at || stripeTimestampToIso(subscription?.trial_start) || null,
    trial_ends_at: trialEndsAt,
    current_period_start: period.start,
    current_period_end: period.end,
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    cancelled_at: stripeTimestampToIso(subscription?.canceled_at) || (status.subscription === 'cancelled' ? now : null),
    grace_period_ends_at: gracePeriodEndsAt,
    provider: 'stripe',
    provider_customer_id: customerId,
    provider_subscription_id: subscriptionId,
    provider_price_id: price.id || existing?.provider_price_id || null,
    checkout_session_id: existing?.checkout_session_id || hints.checkoutSessionId || null,
    latest_invoice_id: stripeObjectId(subscription?.latest_invoice) || existing?.latest_invoice_id || null,
    last_payment_at: existing?.last_payment_at || null,
    last_payment_failed_at: existing?.last_payment_failed_at || null,
    admin_override: false,
    metadata: { ...(existing?.metadata || {}), version: APP_VERSION, stripe_status: subscription?.status || '', last_stripe_sync_at: now },
    created_at: existing?.created_at || now,
    updated_at: now
  }, 'tenant_id');

  await updateRow('tenants', `id=${eq(resolvedTenantId)}`, {
    plan_code: planCode,
    plan_status: status.plan,
    account_status: status.account,
    status: status.account,
    trial_ends_at: trialEndsAt,
    updated_at: now
  });
  return row;
}

async function processCheckoutSession(session) {
  const subscriptionId = stripeObjectId(session.subscription);
  if (!subscriptionId) return null;
  const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET', params: { expand: ['items.data.price', 'latest_invoice'] } });
  return applySubscription(subscription, {
    tenantId: String(session.client_reference_id || metadataValue(session, 'my_passwords_tenant_id') || ''),
    planCode: metadataValue(session, 'my_passwords_plan_code'),
    billingInterval: metadataValue(session, 'my_passwords_billing_interval'),
    customerId: stripeObjectId(session.customer),
    checkoutSessionId: session.id
  });
}

async function processCheckoutExpired(session) {
  const tenantId = String(session.client_reference_id || metadataValue(session, 'my_passwords_tenant_id') || '');
  const existing = await findSubscriptionRow({ tenantId, customerId: stripeObjectId(session.customer) });
  if (!existing?.id || existing.provider_subscription_id) return existing;
  if (existing.checkout_session_id && existing.checkout_session_id !== session.id) return existing;
  return updateRow('tenant_subscriptions', `id=${eq(existing.id)}`, {
    status: 'checkout_expired',
    checkout_session_id: null,
    updated_at: new Date().toISOString()
  });
}

async function processInvoice(invoice, paid) {
  const subscriptionId = stripeObjectId(invoice.subscription || invoice.parent?.subscription_details?.subscription);
  const customerId = stripeObjectId(invoice.customer);
  let subscriptionRow = await findSubscriptionRow({ subscriptionId, customerId });
  if (subscriptionId) {
    const stripeSubscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET', params: { expand: ['items.data.price', 'latest_invoice'] } }).catch(() => null);
    if (stripeSubscription?.id) subscriptionRow = await applySubscription(stripeSubscription, { customerId });
  }
  if (!subscriptionRow?.id) throw new Error('Stripe invoice could not be matched to a My Passwords subscription.');
  const now = new Date().toISOString();
  const patch = paid
    ? { status: subscriptionRow.status === 'trialing' ? 'trialing' : 'active', latest_invoice_id: invoice.id, last_payment_at: now, last_payment_failed_at: null, grace_period_ends_at: null, updated_at: now }
    : { status: 'past_due', latest_invoice_id: invoice.id, last_payment_failed_at: now, grace_period_ends_at: subscriptionRow.grace_period_ends_at || new Date(Date.now() + 7 * 86400000).toISOString(), updated_at: now };
  const updated = await updateRow('tenant_subscriptions', `id=${eq(subscriptionRow.id)}`, patch);
  if (paid) {
    await updateRow('tenants', `id=${eq(subscriptionRow.tenant_id)}`, { plan_status: 'active', account_status: 'active', status: 'active', updated_at: now });
  } else {
    await updateRow('tenants', `id=${eq(subscriptionRow.tenant_id)}`, { plan_status: 'payment_problem', account_status: 'active', status: 'active', updated_at: now });
  }
  return updated;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  if (!stripeWebhookConfigured()) return jsonResponse(503, { ok: false, version: APP_VERSION, message: 'STRIPE_WEBHOOK_SECRET is not configured.' });
  const rawBody = rawRequestBody(event);
  const signature = event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'] || '';
  let stripeEvent;
  try {
    stripeEvent = verifyStripeWebhook(rawBody, signature);
  } catch (error) {
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: error.message });
  }

  const duplicate = await selectRows('billing_events', `select=id,status&provider=eq.stripe&provider_event_id=${eq(stripeEvent.id)}&limit=1`).catch(() => []);
  if (duplicate?.[0]?.id && duplicate[0].status === 'processed') return jsonResponse(200, { ok: true, version: APP_VERSION, duplicate: true, message: 'Stripe event already processed.' });

  try {
    const object = stripeEvent.data?.object || {};
    let subscriptionRow = null;
    if (stripeEvent.type === 'checkout.session.completed') subscriptionRow = await processCheckoutSession(object);
    else if (stripeEvent.type === 'checkout.session.expired') subscriptionRow = await processCheckoutExpired(object);
    else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed'].includes(stripeEvent.type)) subscriptionRow = await applySubscription(object);
    else if (['invoice.paid', 'invoice.payment_succeeded'].includes(stripeEvent.type)) subscriptionRow = await processInvoice(object, true);
    else if (['invoice.payment_failed', 'invoice.payment_action_required'].includes(stripeEvent.type)) subscriptionRow = await processInvoice(object, false);
    else if (stripeEvent.type === 'customer.subscription.trial_will_end') subscriptionRow = await findSubscriptionRow({ subscriptionId: stripeObjectId(object) });

    const amountMinor = Number(object.amount_paid ?? object.amount_due ?? object.amount_total ?? 0);
    const currency = String(object.currency || 'gbp').toUpperCase();
    const now = new Date().toISOString();
    await upsertRow('billing_events', {
      id: `stripe_event_${stripeEvent.id}`,
      tenant_id: subscriptionRow?.tenant_id || metadataValue(object, 'my_passwords_tenant_id') || null,
      subscription_id: subscriptionRow?.id || null,
      provider: 'stripe',
      provider_event_id: stripeEvent.id,
      event_type: stripeEvent.type,
      status: 'processed',
      amount_minor: amountMinor || null,
      currency,
      metadata: { version: APP_VERSION, stripe_object_id: object.id || '', livemode: Boolean(stripeEvent.livemode) },
      occurred_at: stripeTimestampToIso(stripeEvent.created) || now,
      created_at: now
    }, 'id');
    return jsonResponse(200, { ok: true, version: APP_VERSION, received: true });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: `Stripe event processing failed: ${error.message}`, details: error.details || null });
  }
}
