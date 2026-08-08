import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow, upsertRow } from './_db.js';

const BILLING_TERMS_VERSION = '2026-08-08';
import { getBillingContext } from './_billing.js';
import { billingIntervalDefinition, publicSiteUrl, stripeAutomaticTaxEnabled, stripeConfigured, stripeObjectId, stripeRequest, syncStripePlan } from './_stripe.js';
import { listCustomerStripeSubscriptions, syncStripeSubscriptionObject } from './_subscription-lifecycle.js';
import { launchReadyPlan, loadPlanEntitlementSnapshot } from './_entitlements.js';
import { assertBrowserAction, claimIdempotency, completeIdempotency, securityErrorResponseHeaders } from './_security.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
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

async function findOrCreateTenantCustomers(context) {
  const found = [];
  const seen = new Set();
  const add = (customer) => {
    if (!customer?.id || customer.deleted || seen.has(customer.id)) return;
    seen.add(customer.id);
    found.push(customer);
  };

  const existingId = String(context.subscription?.provider_customer_id || '').trim();
  if (existingId) add(await stripeRequest(`customers/${encodeURIComponent(existingId)}`, { method: 'GET' }).catch(() => null));

  const tenantQuery = `metadata['my_passwords_tenant_id']:'${String(context.tenant.id).replace(/'/g, '')}'`;
  const search = await stripeRequest('customers/search', { method: 'GET', params: { query: tenantQuery, limit: 100 } }).catch(() => null);
  for (const customer of search?.data || []) add(customer);

  if (context.user.email) {
    const byEmail = await stripeRequest('customers', { method: 'GET', params: { email: context.user.email, limit: 100 } }).catch(() => null);
    for (const customer of byEmail?.data || []) {
      if (String(customer?.metadata?.my_passwords_tenant_id || '') === context.tenant.id || customer.id === existingId) add(customer);
    }
  }

  if (!found.length) {
    add(await stripeRequest('customers', {
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
    }));
  }
  return found;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  if (!stripeConfigured()) return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe Billing is not configured yet.' });

  const context = await getBillingContext(event);
  if (!context.ok) return jsonResponse(context.code === 'SESSION_REQUIRED' ? 401 : 409, { ok: false, version: APP_VERSION, code: context.code, message: context.message });
  try { assertBrowserAction(event, { session: context.session, kind: 'customer', csrf: true }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code || 'SECURITY_CHECK_FAILED', message: error.message }, securityErrorResponseHeaders(error)); }

  const body = parseBody(event);
  const billingTermsAccepted = body.billingTermsAccepted === true;
  const billingTermsVersion = String(body.billingTermsVersion || '').trim();
  if (!billingTermsAccepted || billingTermsVersion !== BILLING_TERMS_VERSION) {
    return jsonResponse(409, {
      ok: false,
      version: APP_VERSION,
      code: 'BILLING_TERMS_ACCEPTANCE_REQUIRED',
      billingTermsVersion: BILLING_TERMS_VERSION,
      message: 'Read and agree to the current Subscription, Cancellation & Refund Policy before opening Stripe Checkout.'
    });
  }

  const existingSubscription = context.subscription || null;
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
      const subscriptionId = stripeObjectId(previousSession.subscription);
      if (subscriptionId) {
        const stripeSubscription = await stripeRequest(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: 'GET', params: { expand: ['items.data.price', 'latest_invoice'] } }).catch(() => null);
        if (stripeSubscription?.id) await syncStripeSubscriptionObject(stripeSubscription, { tenantId: context.tenant.id, tenant: context.tenant, existing: existingSubscription, checkoutSessionId: previousSession.id }).catch(() => null);
      }
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'SUBSCRIPTION_ALREADY_EXISTS',
        portalAvailable: Boolean(existingSubscription.provider_customer_id),
        message: 'The completed Stripe checkout has been restored in My Subscription. Refresh the subscription status to see the latest details.'
      });
    }
    await updateRow('tenant_subscriptions', `id=${eq(existingSubscription.id)}`, {
      status: 'checkout_expired',
      checkout_session_id: null,
      updated_at: new Date().toISOString()
    }).catch(() => null);
  }

  const planCode = String(body.planCode || context.tenant.plan_code || 'personal').trim().toLowerCase();
  const interval = billingIntervalDefinition(body.billingInterval || 'monthly');
  const requestId = String(body.requestId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!interval) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Choose monthly, quarterly or annual billing.' });

  let idempotencyClaim = null;
  try {
    idempotencyClaim = await claimIdempotency({
      scope: 'stripe_checkout', requestId, tenantId: context.tenant.id, userId: context.user.id,
      payload: { planCode, billingInterval: interval.key }
    });
    let plan = await loadPlan(planCode);
    if (!plan?.id || !launchReadyPlan(plan.code)) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'PLAN_NOT_AVAILABLE', message: 'That subscription plan is not currently available. Personal is the current launch plan.' });
    if (Number(plan[interval.amountColumn] || 0) <= 0) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'PRICE_NOT_AVAILABLE', message: `${interval.label} billing has not been priced yet.` });

    if (!plan[interval.priceColumn] || plan.stripe_sync_status !== 'ready') {
      const synced = await syncStripePlan(plan);
      plan = synced.plan || plan;
      if (!synced.ok || !plan[interval.priceColumn]) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'STRIPE_PLAN_NOT_READY', message: synced.message || 'This plan is not ready for Stripe Checkout.' });
    }

    const matchingCustomers = await findOrCreateTenantCustomers(context);
    const customer = matchingCustomers.find((item) => item.id === existingSubscription?.provider_customer_id) || matchingCustomers[0];
    if (!customer?.id) throw new Error('Stripe customer could not be created or restored.');
    const remoteSubscriptions = (await Promise.all(matchingCustomers.map((item) => listCustomerStripeSubscriptions(item.id).catch(() => [])))).flat();
    const liveRemoteSubscriptions = remoteSubscriptions.filter((subscription) => ['incomplete', 'trialing', 'active', 'past_due', 'unpaid', 'paused'].includes(String(subscription?.status || '').toLowerCase()));
    if (liveRemoteSubscriptions.length > 1) {
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'OVERLAPPING_SUBSCRIPTIONS',
        duplicateSubscriptionIds: liveRemoteSubscriptions.map((subscription) => subscription.id),
        portalAvailable: true,
        message: 'More than one live Stripe subscription exists for this account. No new checkout was created. Review the subscriptions in Stripe Dashboard, keep one subscription, then refresh again.'
      });
    }
    if (liveRemoteSubscriptions.length === 1) {
      await syncStripeSubscriptionObject(liveRemoteSubscriptions[0], { tenantId: context.tenant.id, tenant: context.tenant, existing: existingSubscription, customerId: customer.id }).catch(() => null);
      return jsonResponse(409, {
        ok: false,
        version: APP_VERSION,
        code: 'SUBSCRIPTION_ALREADY_EXISTS',
        portalAvailable: true,
        message: 'Stripe already has a live subscription for this account. Its status has been restored in My Subscription.'
      });
    }
    const baseUrl = publicSiteUrl(event);
    const trialEnd = remainingTrialEnd(context.tenant);
    const automaticTaxEnabled = stripeAutomaticTaxEnabled();
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
        ...(automaticTaxEnabled ? { automatic_tax: { enabled: true }, customer_update: { address: 'auto' } } : {}),
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
    const entitlementSnapshot = context.subscription?.entitlements_snapshot?.version
      ? context.subscription.entitlements_snapshot
      : await loadPlanEntitlementSnapshot(plan.code);
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
      admin_override: Boolean(context.subscription?.admin_override),
      entitlements_snapshot: entitlementSnapshot,
      entitlements_snapshot_at: context.subscription?.entitlements_snapshot_at || now,
      entitlement_overrides: context.subscription?.entitlement_overrides || {},
      entitlement_override_note: context.subscription?.entitlement_override_note || '',
      entitlement_override_updated_at: context.subscription?.entitlement_override_updated_at || null,
      entitlement_override_updated_by: context.subscription?.entitlement_override_updated_by || null,
      metadata: {
        ...(context.subscription?.metadata || {}),
        version: APP_VERSION,
        checkout_request_id: requestId,
        checkout_created_at: now,
        preserved_trial_end: trialEnd || null,
        billing_terms_acceptance: { accepted: true, accepted_at: now, document_version: BILLING_TERMS_VERSION }
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
      metadata: { plan_code: plan.code, billing_interval: interval.key, stripe_customer_id: customer.id, preserved_trial_end: trialEnd || null, billing_terms_version: BILLING_TERMS_VERSION, billing_terms_accepted_at: now },
      occurred_at: now,
      created_at: now
    }).catch(() => null);

    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: context.tenant.id,
      user_id: context.user.id,
      action: 'paid_subscription_terms_accepted',
      metadata: {
        version: APP_VERSION,
        document_version: BILLING_TERMS_VERSION,
        accepted_at: now,
        plan_code: plan.code,
        billing_interval: interval.key,
        amount_minor: Number(plan[interval.amountColumn] || 0),
        currency: 'GBP',
        source: 'plan_and_billing_checkout'
      },
      created_at: now
    }).catch(() => null);

    await completeIdempotency(idempotencyClaim, 'completed');
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
      automaticTaxEnabled,
      message: 'Stripe Checkout is ready.'
    });
  } catch (error) {
    await completeIdempotency(idempotencyClaim, 'failed');
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, code: error.code || 'STRIPE_CHECKOUT_FAILED', message: `Could not open Stripe Checkout. ${error.message}`, details: error.details || null }, securityErrorResponseHeaders(error));
  }
}
