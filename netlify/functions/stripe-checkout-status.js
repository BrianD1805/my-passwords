import { APP_VERSION, jsonResponse } from './_db.js';
import { getBillingContext } from './_billing.js';
import { stripeConfigured, stripeRequest, stripeObjectId } from './_stripe.js';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET required.' });
  if (!stripeConfigured()) return jsonResponse(503, { ok: false, version: APP_VERSION, message: 'Stripe Billing is not configured yet.' });
  const context = await getBillingContext(event);
  if (!context.ok) return jsonResponse(context.code === 'SESSION_REQUIRED' ? 401 : 409, { ok: false, version: APP_VERSION, code: context.code, message: context.message });
  const sessionId = String(event.queryStringParameters?.session_id || '').trim();
  if (!sessionId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Checkout session ID is required.' });
  try {
    const session = await stripeRequest(`checkout/sessions/${encodeURIComponent(sessionId)}`, { method: 'GET', params: { expand: ['subscription'] } });
    if (String(session.client_reference_id || session.metadata?.my_passwords_tenant_id || '') !== context.tenant.id) return jsonResponse(403, { ok: false, version: APP_VERSION, message: 'This checkout session belongs to another account.' });
    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      checkoutStatus: session.status || '',
      paymentStatus: session.payment_status || '',
      subscriptionId: stripeObjectId(session.subscription),
      message: session.status === 'complete' ? 'Payment details were submitted. Stripe is confirming the subscription by webhook.' : 'Checkout has not completed yet.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: `Could not check Stripe Checkout. ${error.message}`, details: error.details || null });
  }
}
