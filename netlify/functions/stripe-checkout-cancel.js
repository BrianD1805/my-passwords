import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, updateRow } from './_db.js';
import { getBillingContext } from './_billing.js';
import { stripeConfigured, stripeRequest } from './_stripe.js';
import { assertBrowserAction, claimIdempotency, completeIdempotency, securityErrorResponseHeaders } from './_security.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  if (!stripeConfigured()) return jsonResponse(503, { ok: false, version: APP_VERSION, message: 'Stripe Billing is not configured yet.' });

  const context = await getBillingContext(event);
  if (!context.ok) return jsonResponse(context.code === 'SESSION_REQUIRED' ? 401 : 409, { ok: false, version: APP_VERSION, code: context.code, message: context.message });
  try { assertBrowserAction(event, { session: context.session, kind: 'customer', csrf: true }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code || 'SECURITY_CHECK_FAILED', message: error.message }, securityErrorResponseHeaders(error)); }
  const body = parseBody(event);
  let idempotencyClaim = null;
  try {
    idempotencyClaim = await claimIdempotency({ scope: 'stripe_checkout_cancel', requestId: String(body.requestId || ''), tenantId: context.tenant.id, userId: context.user.id, payload: { action: 'cancel_checkout' } });
  } catch (error) {
    return jsonResponse(error.status || 409, { ok: false, version: APP_VERSION, code: error.code || 'SECURITY_CHECK_FAILED', message: error.message }, securityErrorResponseHeaders(error));
  }
  const subscription = context.subscription;
  if (!subscription?.id || subscription.provider !== 'stripe' || subscription.provider_subscription_id) {
    await completeIdempotency(idempotencyClaim, 'completed');
    return jsonResponse(200, { ok: true, version: APP_VERSION, message: 'No incomplete Stripe Checkout needs to be cancelled.' });
  }

  const checkoutSessionId = String(subscription.checkout_session_id || '').trim();
  if (checkoutSessionId) {
    const session = await stripeRequest(`checkout/sessions/${encodeURIComponent(checkoutSessionId)}`, { method: 'GET' }).catch(() => null);
    if (session?.status === 'open') {
      await stripeRequest(`checkout/sessions/${encodeURIComponent(checkoutSessionId)}/expire`, { params: {} }).catch(() => null);
    }
  }

  const now = new Date().toISOString();
  const updated = await updateRow('tenant_subscriptions', `id=${eq(subscription.id)}`, {
    status: 'checkout_cancelled',
    checkout_session_id: null,
    updated_at: now
  });

  await insertRow('billing_events', {
    id: publicId('billing_event'),
    tenant_id: context.tenant.id,
    subscription_id: updated?.id || subscription.id,
    provider: 'stripe',
    provider_event_id: checkoutSessionId || null,
    event_type: 'checkout_cancelled_by_customer',
    status: 'cancelled',
    amount_minor: Number(subscription.price_minor || 0) || null,
    currency: subscription.currency || 'GBP',
    metadata: { version: APP_VERSION },
    occurred_at: now,
    created_at: now
  }).catch(() => null);

  await completeIdempotency(idempotencyClaim, 'completed');
  return jsonResponse(200, { ok: true, version: APP_VERSION, message: 'Checkout was cancelled. No subscription change was made.' });
}
