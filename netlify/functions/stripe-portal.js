import { APP_VERSION, jsonResponse } from './_db.js';
import { getBillingContext } from './_billing.js';
import { publicSiteUrl, stripeConfigured, stripeRequest } from './_stripe.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  if (!stripeConfigured()) return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe Billing is not configured yet.' });
  const context = await getBillingContext(event);
  if (!context.ok) return jsonResponse(context.code === 'SESSION_REQUIRED' ? 401 : 409, { ok: false, version: APP_VERSION, code: context.code, message: context.message });
  const customerId = String(context.subscription?.provider_customer_id || '').trim();
  if (!customerId) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'STRIPE_CUSTOMER_REQUIRED', message: 'No Stripe billing profile exists for this account yet.' });

  try {
    const session = await stripeRequest('billing_portal/sessions', {
      params: {
        customer: customerId,
        return_url: `${publicSiteUrl(event)}/vault?billing=portal-return`
      }
    });
    return jsonResponse(200, { ok: true, version: APP_VERSION, portalUrl: session.url, message: 'Stripe Customer Portal is ready.' });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, code: error.code || 'STRIPE_PORTAL_FAILED', message: `Could not open the Stripe Customer Portal. ${error.message}`, details: error.details || null });
  }
}
