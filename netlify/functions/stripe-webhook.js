import { APP_VERSION, jsonResponse, selectRows, supabaseRequest, updateRow, upsertRow } from './_db.js';
import { stripeObjectId, stripeRequest, stripeTimestampToIso, stripeWebhookConfigured, verifyStripeWebhook } from './_stripe.js';
import { processStripeInvoiceObject, syncStripeSubscriptionObject } from './_subscription-lifecycle.js';
import { sendCustomerLifecycleEmailForTenant } from './_customer-email.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function rawRequestBody(event) {
  return event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : String(event.body || '');
}

function metadataValue(object, key) {
  return String(object?.metadata?.[key] || '');
}

async function findSubscriptionRow({ tenantId = '', subscriptionId = '', customerId = '' }) {
  // Provider identifiers are authoritative for an existing Stripe relationship.
  // Tenant metadata is only a fallback for the first event before a provider ID has been stored.
  if (subscriptionId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&provider_subscription_id=${eq(subscriptionId)}&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (customerId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&provider_customer_id=${eq(customerId)}&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  if (tenantId) {
    const rows = await selectRows('tenant_subscriptions', `select=*&tenant_id=${eq(tenantId)}&limit=1`);
    if (rows?.[0]) return rows[0];
  }
  return null;
}

async function claimWebhookEvent(stripeEvent) {
  const result = await supabaseRequest('rpc/claim_stripe_webhook_event', {
    method: 'POST',
    body: JSON.stringify({ p_event_id: stripeEvent.id, p_event_type: stripeEvent.type, p_stale_seconds: 300 })
  });
  const claim = Array.isArray(result) ? result[0] : result;
  if (!claim?.row_id) throw new Error('Stripe webhook replay claim did not return a row ID.');
  return {
    duplicate: !claim.claimed,
    processing: claim.reason === 'processing',
    row: { id: claim.row_id }
  };
}

async function finishWebhookEvent(claim, status, errorMessage = '') {
  if (!claim?.row?.id) return;
  const now = new Date().toISOString();
  await updateRow('stripe_webhook_events', `id=${eq(claim.row.id)}`, {
    status, error_message: errorMessage ? String(errorMessage).slice(0, 1000) : null,
    processed_at: status === 'succeeded' ? now : null, updated_at: now
  }).catch(() => null);
}

async function processCheckoutSession(session) {
  const subscriptionId = stripeObjectId(session.subscription);
  if (!subscriptionId) return null;
  const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET', params: { expand: ['items.data.price', 'latest_invoice'] } });
  const synced = await syncStripeSubscriptionObject(subscription, {
    tenantId: String(session.client_reference_id || metadataValue(session, 'my_passwords_tenant_id') || ''),
    planCode: metadataValue(session, 'my_passwords_plan_code'),
    billingInterval: metadataValue(session, 'my_passwords_billing_interval'),
    customerId: stripeObjectId(session.customer),
    checkoutSessionId: session.id
  });
  return synced.row;
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


async function sendLifecycleEmail(tenantId, options) {
  if (!tenantId) return null;
  return sendCustomerLifecycleEmailForTenant(tenantId, options).catch((error) => ({ sent: false, reason: error.message || 'Customer email could not be queued.' }));
}

function invoiceRenewalAt(invoice) {
  return stripeTimestampToIso(invoice?.next_payment_attempt || invoice?.period_end || invoice?.lines?.data?.[0]?.period?.end);
}

async function sendStripeLifecycleEmails({ stripeEvent, object, before, after }) {
  const tenantId = after?.tenant_id || before?.tenant_id || metadataValue(object, 'my_passwords_tenant_id') || '';
  if (!tenantId) return [];
  const sent = [];
  const type = stripeEvent.type;
  const previous = stripeEvent.data?.previous_attributes || {};
  const currentStatus = String(after?.status || object?.status || '').toLowerCase();
  const previousStatus = String(previous?.status || before?.status || '').toLowerCase();
  const subscriptionId = after?.provider_subscription_id || stripeObjectId(object?.subscription || object) || before?.provider_subscription_id || '';

  const send = async (emailType, idempotencyKey, context = {}, metadata = {}) => {
    const result = await sendLifecycleEmail(tenantId, {
      type: emailType,
      idempotencyKey,
      context,
      metadata: { source: 'stripe_webhook', stripe_event_id: stripeEvent.id, stripe_event_type: type, ...metadata }
    });
    sent.push({ emailType, sent: Boolean(result?.sent), skipped: Boolean(result?.skipped), reason: result?.reason || '' });
  };

  if (type === 'customer.subscription.trial_will_end') {
    const trialEndsAt = stripeTimestampToIso(object?.trial_end) || after?.trial_ends_at || before?.trial_ends_at || null;
    if (trialEndsAt) await send('trial_ending_soon', `trial_ending_soon:${tenantId}:${trialEndsAt}`, { trialEndsAt });
  }

  if (type === 'invoice.upcoming') {
    const renewalAt = invoiceRenewalAt(object) || after?.next_invoice_at || after?.current_period_end || before?.current_period_end || null;
    const amountMinor = Number(object?.amount_due ?? object?.total ?? after?.next_invoice_amount_minor ?? after?.price_minor ?? 0);
    const currency = String(object?.currency || after?.next_invoice_currency || after?.currency || 'GBP').toUpperCase();
    if (after?.id && renewalAt) await send('upcoming_renewal', `upcoming_renewal:${after.id}:${after.current_period_end || renewalAt}`, { renewalAt, amountMinor, currency });
  }

  if (type === 'invoice.payment_failed' && after?.id) {
    const failureKey = after.last_payment_failed_at || stripeTimestampToIso(stripeEvent.created) || stripeEvent.id;
    const amountMinor = Number(object?.amount_due ?? object?.amount_remaining ?? 0);
    const currency = String(object?.currency || after.currency || 'GBP').toUpperCase();
    await send('payment_failed', `payment_failed:${after.id}:${failureKey}`, { amountMinor, currency });
    if (after.grace_period_ends_at) await send('grace_period_started', `grace_period_started:${after.id}:${failureKey}`, { gracePeriodEndsAt: after.grace_period_ends_at });
  }

  if (type === 'invoice.payment_action_required' && after?.id) {
    await send('payment_action_required', `payment_action_required:${after.id}:${object?.id || stripeEvent.id}`, {
      amountMinor: Number(object?.amount_due ?? object?.amount_remaining ?? 0),
      currency: String(object?.currency || after.currency || 'GBP').toUpperCase()
    });
  }

  const becameActive = currentStatus === 'active' && previousStatus !== 'active';
  const checkoutActivated = type === 'checkout.session.completed' && currentStatus === 'active';
  const subscriptionCreatedActive = type === 'customer.subscription.created' && currentStatus === 'active';
  if ((becameActive || checkoutActivated || subscriptionCreatedActive) && after?.id) {
    await send('subscription_activated', `subscription_activated:${subscriptionId || after.id}:${after.current_period_start || 'active'}`, { currentPeriodEnd: after.current_period_end });
  }

  const cancellationBecameScheduled = type === 'customer.subscription.updated'
    && (previous?.cancel_at_period_end === false || (before && !before.cancel_at_period_end))
    && Boolean(object?.cancel_at_period_end || after?.cancel_at_period_end);
  if (cancellationBecameScheduled && after?.id) {
    await send('cancellation_scheduled', `cancellation_scheduled:${after.id}:${after.current_period_end || 'period_end'}`, { cancellationAt: after.current_period_end });
  }

  const cancellationRemoved = (type === 'customer.subscription.resumed') || (type === 'customer.subscription.updated'
    && (previous?.cancel_at_period_end === true || before?.cancel_at_period_end === true)
    && !Boolean(object?.cancel_at_period_end || after?.cancel_at_period_end));
  if (cancellationRemoved && after?.id && ['active', 'trialing'].includes(currentStatus)) {
    await send('subscription_reactivated', `subscription_reactivated:${after.id}:${after.current_period_end || 'current_period'}`, { currentPeriodEnd: after.current_period_end });
  }

  const cancelled = type === 'customer.subscription.deleted'
    || (['cancelled', 'canceled', 'incomplete_expired'].includes(currentStatus) && !['cancelled', 'canceled', 'incomplete_expired'].includes(previousStatus));
  if (cancelled && after?.id) {
    await send('subscription_cancelled', `subscription_cancelled:${after.id}:${after.cancelled_at || stripeTimestampToIso(object?.canceled_at) || stripeEvent.id}`);
  }

  const previousPlanCode = before?.plan_code || previous?.metadata?.my_passwords_plan_code || '';
  const nextPlanCode = after?.plan_code || metadataValue(object, 'my_passwords_plan_code') || '';
  if (after?.id && previousPlanCode && nextPlanCode && previousPlanCode !== nextPlanCode) {
    await send('plan_changed', `plan_changed:${after.id}:${after.current_period_start || after.updated_at || nextPlanCode}`, {
      previousPlanCode,
      planCode: nextPlanCode,
      billingInterval: after.billing_interval || metadataValue(object, 'my_passwords_billing_interval') || ''
    });
  }

  return sent;
}

async function processScheduleEvent(schedule) {
  const subscriptionId = stripeObjectId(schedule.subscription || schedule.released_subscription);
  const customerId = stripeObjectId(schedule.customer);
  const local = await findSubscriptionRow({ subscriptionId, customerId, tenantId: metadataValue(schedule, 'my_passwords_tenant_id') });
  if (!subscriptionId) {
    if (local?.id && ['released', 'completed', 'canceled', 'aborted'].includes(String(schedule.status || '').toLowerCase())) {
      return updateRow('tenant_subscriptions', `id=${eq(local.id)}`, {
        stripe_schedule_id: null,
        scheduled_plan_code: null,
        scheduled_billing_interval: null,
        scheduled_price_id: null,
        scheduled_change_at: null,
        scheduled_change_type: null,
        scheduled_change_created_at: null,
        updated_at: new Date().toISOString()
      });
    }
    return local;
  }
  const subscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET', params: { expand: ['items.data.price', 'latest_invoice'] } });
  const synced = await syncStripeSubscriptionObject(subscription, { tenantId: local?.tenant_id || metadataValue(schedule, 'my_passwords_tenant_id'), existing: local, schedule });
  return synced.row;
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

  let webhookClaim;
  try {
    webhookClaim = await claimWebhookEvent(stripeEvent);
  } catch (error) {
    return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'WEBHOOK_REPLAY_GUARD_UNAVAILABLE', message: 'Stripe event replay protection is not available. Apply the Ver-0.050 security migration.' });
  }
  if (webhookClaim.duplicate) return jsonResponse(200, { ok: true, version: APP_VERSION, duplicate: true, processing: Boolean(webhookClaim.processing), message: webhookClaim.processing ? 'Stripe event is already being processed.' : 'Stripe event already processed.' });

  try {
    const object = stripeEvent.data?.object || {};
    const before = await findSubscriptionRow({
      tenantId: String(object.client_reference_id || metadataValue(object, 'my_passwords_tenant_id') || ''),
      subscriptionId: stripeObjectId(object.subscription || (String(object.object || '') === 'subscription' ? object : null)),
      customerId: stripeObjectId(object.customer)
    }).catch(() => null);
    let subscriptionRow = null;
    if (stripeEvent.type === 'checkout.session.completed') subscriptionRow = await processCheckoutSession(object);
    else if (stripeEvent.type === 'checkout.session.expired') subscriptionRow = await processCheckoutExpired(object);
    else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed'].includes(stripeEvent.type)) {
      const synced = await syncStripeSubscriptionObject(object);
      subscriptionRow = synced.row;
    } else if (['invoice.paid', 'invoice.payment_succeeded'].includes(stripeEvent.type)) subscriptionRow = await processStripeInvoiceObject(object, true);
    else if (['invoice.payment_failed', 'invoice.payment_action_required'].includes(stripeEvent.type)) subscriptionRow = await processStripeInvoiceObject(object, false);
    else if (stripeEvent.type === 'invoice.upcoming') subscriptionRow = await findSubscriptionRow({ subscriptionId: stripeObjectId(object.subscription || object.parent?.subscription_details?.subscription), customerId: stripeObjectId(object.customer) });
    else if (stripeEvent.type === 'customer.subscription.trial_will_end') subscriptionRow = await findSubscriptionRow({ subscriptionId: stripeObjectId(object) });
    else if (stripeEvent.type.startsWith('subscription_schedule.')) subscriptionRow = await processScheduleEvent(object);

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
    const lifecycleEmails = await sendStripeLifecycleEmails({ stripeEvent, object, before, after: subscriptionRow });
    await finishWebhookEvent(webhookClaim, 'succeeded');
    return jsonResponse(200, { ok: true, version: APP_VERSION, received: true, lifecycleEmails });
  } catch (error) {
    await finishWebhookEvent(webhookClaim, 'failed', error.message || 'Stripe event processing failed.');
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: `Stripe event processing failed: ${error.message}`, details: error.details || null });
  }
}
