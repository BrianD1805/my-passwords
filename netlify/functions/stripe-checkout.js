import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow, upsertRow } from './_db.js';
import { getBillingContext } from './_billing.js';
import { billingIntervalDefinition, publicSiteUrl, stripeConfigured, stripeRequest, syncStripePlan } from './_stripe.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function activeStripeSubscription(subscription) {
  return Boolean(subscription?.provider_subscription_id)
    && ['checkout_pending', 'incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'].includes(String(subscription.status || '').toLowerCase());
}

function remainingTrialEnd(tenant) {
  const timestamp = tenant?.trial_ends_at ? Math.floor(new Date(tenant.trial_ends_at).getTime() / 1000) : 0;
  const now = Math.floor(Date.now() / 1000);
  return timestamp >= now + (48 * 60 * 60) ? timestamp : 0;
}

async function loadPlan(planCode) {
  const rows = await selectRows('subscription_plans', `select=*&code=${eq(planCode)}&is_active=eq.true&is_public=eq.true&limit=1`);
  return rows?.[0] || null;
}

async function createOrReuseCustomer(context) {
  const existingId = String(context.subscription?.provider_customer_id || '').trim();
  if (existingId) {
    const customer = await stripeRequest(`customers/${encodeURIComponent(existingId)}`, { method: 'GET' }).catch(() => null);
    if (customer?.id && !customer.deleted) return customer;
  }
  return stripeRequest('customers', {
    idempotencyKey: `mp-customer-${context.tenant.id}`,
    params: {
      email: context.user.email || undefined,
      name: context.user.display_name || context.tenant.account_name || context.tenant.name || undefined,
      metadata: {
        my_passwords_tenant_id: context.tenant.id,
        my_passwords_user_id: context.user.id,
        my_passwords_account_name: context.tenant.account_name || context.tenant.name || ''
      }
    }
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  if (!stripeConfigured()) return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe Billing is not configured yet.' });

  const context = await getBillingContext(event);
  if (!context.ok) return jsonResponse(context.code === 'SESSION_REQUIRED' ? 401 : 409, { ok: false, version: APP_VERSION, code: context.code, message: context.message });
  const existingSubscription = context.subscription || null;
  if (existingSubscription?.provider === 'stripe' && existingSubscription?.provider_subscription_id) {
    return jsonResponse(409, {
      ok: false,
      version: APP_VERSION,
      code: 'SUBSCRIPTION_ALREADY_EXISTS',
      portalAvailable: Boolean(existingSubscription.provider_customer_id),
      message: 'This account already has a Stripe subscription. Open My Subscription to manage it.'
    });
  }

  if (existingSubscription?.status === 'checkout_pending' && existingSubscription?.checkout_session_id) {
    const previousSession = await stripeRequest(`checkout/sessions/${encodeURIComponent(existingSubscription.checkout_session_id)}`, { method: 'GET' }).catch(() => null);
    if (previousSession?.status === 'open' && previousSession?.url) {
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        reused: true,
        checkoutUrl: previousSession.url,
        checkoutSessionId: previousSession.id,
        message: 'Your existing Stripe Checkout is ready.'
      });
    }
    if (previousSession?.status === 'complete') {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'CHECKOUT_CONFIRMING',
        message: 'Stripe is confirming your completed checkout. Refresh your subscription status in a moment.'
      });
    }
    await updateRow('tenant_subscriptions', `id=${eq(existingSubscription.id)}`, {
      status: 'checkout_expired',
      checkout_session_id: null,
      updated_at: new Date().toISOString()
    }).catch(() => null);
  } else if (activeStripeSubscription(existingSubscription)) {
    return jsonResponse(409, {
      ok: false,
      version: APP_VERSION,
      code: 'SUBSCRIPTION_ALREADY_EXISTS',
      portalAvailable: Boolean(existingSubscription.provider_customer_id),
      message: 'This account already has a Stripe subscription or checkout in progress. Open My Subscription to manage it.'
    });
  }

  const body = parseBody(event);
  const planCode = String(body.planCode || context.tenant.plan_code || 'personal').trim().toLowerCase();
  const interval = billingIntervalDefinition(body.billingInterval || 'monthly');
  const requestId = String(body.requestId || publicId('checkout_request')).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!interval) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Choose monthly, quarterly or annual billing.' });

  try {
    let plan = await loadPlan(planCode);
    if (!plan?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'PLAN_NOT_AVAILABLE', message: 'That subscription plan is not currently available.' });
    if (Number(plan[interval.amountColumn] || 0) <= 0) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'PRICE_NOT_AVAILABLE', message: `${interval.label} billing has not been priced yet.` });

    if (!plan[interval.priceColumn] || plan.stripe_sync_status !== 'ready') {
      const synced = await syncStripePlan(plan);
      plan = synced.plan || plan;
      if (!synced.ok || !plan[interval.priceColumn]) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'STRIPE_PLAN_NOT_READY', message: synced.message || 'This plan is not ready for Stripe Checkout.' });
    }

    const customer = await createOrReuseCustomer(context);
    const baseUrl = publicSiteUrl(event);
    const trialEnd = remainingTrialEnd(context.tenant);
    const session = await stripeRequest('checkout/sessions', {
      idempotencyKey: `mp-checkout-${context.tenant.id}-${requestId}`,
      params: {
        mode: 'subscription',
        customer: customer.id,
        client_reference_id: context.tenant.id,
        line_items: [{ price: plan[interval.priceColumn], quantity: 1 }],
        success_url: `${baseUrl}/vault?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/vault?billing=cancelled`,
        billing_address_collection: 'auto',
        payment_method_collection: 'always',
        allow_promotion_codes: false,
        metadata: {
          my_passwords_tenant_id: context.tenant.id,
          my_passwords_user_id: context.user.id,
          my_passwords_plan_code: plan.code,
          my_passwords_billing_interval: interval.key,
          my_passwords_request_id: requestId
        },
        subscription_data: {
          ...(trialEnd ? { trial_end: trialEnd } : {}),
          metadata: {
            my_passwords_tenant_id: context.tenant.id,
            my_passwords_user_id: context.user.id,
            my_passwords_plan_code: plan.code,
            my_passwords_billing_interval: interval.key
          }
        }
      }
    });

    const now = new Date().toISOString();
    const subscriptionRow = await upsertRow('tenant_subscriptions', {
      id: context.subscription?.id || publicId('subscription'),
      tenant_id: context.tenant.id,
      plan_code: plan.code,
      status: 'checkout_pending',
      billing_interval: interval.key,
      currency: 'GBP',
      price_minor: Number(plan[interval.amountColumn] || 0),
      trial_started_at: context.tenant.trial_started_at || context.subscription?.trial_started_at || null,
      trial_ends_at: context.tenant.trial_ends_at || context.subscription?.trial_ends_at || null,
      current_period_start: context.subscription?.current_period_start || null,
      current_period_end: context.subscription?.current_period_end || null,
      cancel_at_period_end: false,
      cancelled_at: null,
      grace_period_ends_at: null,
      provider: 'stripe',
      provider_customer_id: customer.id,
      provider_subscription_id: null,
      provider_price_id: plan[interval.priceColumn],
      checkout_session_id: session.id,
      latest_invoice_id: context.subscription?.latest_invoice_id || null,
      last_payment_at: context.subscription?.last_payment_at || null,
      last_payment_failed_at: context.subscription?.last_payment_failed_at || null,
      admin_override: false,
      metadata: {
        ...(context.subscription?.metadata || {}),
        version: APP_VERSION,
        checkout_request_id: requestId,
        checkout_created_at: now,
        preserved_trial_end: trialEnd || null
      },
      created_at: context.subscription?.created_at || now,
      updated_at: now
    }, 'tenant_id');

    await insertRow('billing_events', {
      id: publicId('billing_event'),
      tenant_id: context.tenant.id,
      subscription_id: subscriptionRow?.id || null,
      provider: 'stripe',
      provider_event_id: session.id,
      event_type: 'checkout_session_created',
      status: 'pending',
      amount_minor: Number(plan[interval.amountColumn] || 0),
      currency: 'GBP',
      metadata: { plan_code: plan.code, billing_interval: interval.key, stripe_customer_id: customer.id, preserved_trial_end: trialEnd || null },
      occurred_at: now,
      created_at: now
    }).catch(() => null);

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      planCode: plan.code,
      billingInterval: interval.key,
      amountMinor: Number(plan[interval.amountColumn] || 0),
      currency: 'GBP',
      trialPreservedUntil: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
      message: 'Stripe Checkout is ready.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, code: error.code || 'STRIPE_CHECKOUT_FAILED', message: `Could not open Stripe Checkout. ${error.message}`, details: error.details || null });
  }
}
