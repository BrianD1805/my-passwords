import { APP_VERSION, jsonResponse, parseBody } from './_db.js';
import { getBillingContext } from './_billing.js';
import { stripeConfigured } from './_stripe.js';
import { resolveTenantEntitlements } from './_entitlements.js';
import { sendCustomerLifecycleEmailForTenant } from './_customer-email.js';
import { assertBrowserAction, claimIdempotency, completeIdempotency, securityErrorResponseHeaders } from './_security.js';
import {
  cancelStripeSubscriptionAtPeriodEnd,
  changeStripeSubscription,
  reactivateStripeSubscription,
  refreshStripeSubscriptionForContext,
  serializeSubscription
} from './_subscription-lifecycle.js';

function responseStatus(error) {
  if (error?.code === 'OVERLAPPING_SUBSCRIPTIONS') return 409;
  if (['PLAN_NOT_AVAILABLE', 'PRICE_NOT_AVAILABLE', 'SUBSCRIPTION_NOT_CHANGEABLE', 'CANCELLATION_SCHEDULED', 'SUBSCRIPTION_ENDED'].includes(error?.code)) return 409;
  return 500;
}

function accountPayload(context) {
  return {
    displayName: context.user?.display_name || '',
    email: context.user?.email || '',
    accountName: context.tenant?.account_name || context.tenant?.name || '',
    planCode: context.tenant?.plan_code || 'personal',
    planStatus: context.tenant?.plan_status || 'trial_pending',
    accountStatus: context.tenant?.account_status || 'active',
    tenantRole: context.tenant?.tenant_role || 'primary_owner',
    trialStartedAt: context.tenant?.trial_started_at || context.subscription?.trial_started_at || null,
    trialEndsAt: context.tenant?.trial_ends_at || context.subscription?.trial_ends_at || null
  };
}

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  if (!stripeConfigured()) return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'STRIPE_NOT_CONFIGURED', message: 'Stripe Billing is not configured yet.' });

  const context = await getBillingContext(event);
  if (!context.ok) {
    const status = context.code === 'SESSION_REQUIRED' ? 401 : 409;
    return jsonResponse(status, { ok: false, version: APP_VERSION, code: context.code, founder: Boolean(context.founder), message: context.message, subscription: serializeSubscription(context.subscription), account: accountPayload(context) });
  }

  let idempotencyClaim = null;
  try {
    let result;
    let action = 'refresh';
    let actionBody = {};
    if (event.httpMethod === 'GET') {
      result = await refreshStripeSubscriptionForContext(context, { recordEvent: true });
    } else {
      assertBrowserAction(event, { session: context.session, kind: 'customer', csrf: true });
      const body = parseBody(event);
      actionBody = body;
      action = String(body.action || 'refresh').trim().toLowerCase();
      idempotencyClaim = await claimIdempotency({
        scope: `stripe_subscription_${action}`,
        requestId: String(body.requestId || ''), tenantId: context.tenant.id, userId: context.user.id,
        payload: { action, planCode: body.planCode || '', billingInterval: body.billingInterval || '' }
      });
      if (action === 'refresh') result = await refreshStripeSubscriptionForContext(context, { recordEvent: true });
      else if (action === 'change_subscription') result = await changeStripeSubscription(context, { planCode: body.planCode, billingInterval: body.billingInterval, requestId: body.requestId });
      else if (action === 'cancel_at_period_end') result = await cancelStripeSubscriptionAtPeriodEnd(context, { requestId: body.requestId });
      else if (action === 'reactivate') result = await reactivateStripeSubscription(context, { requestId: body.requestId });
      else return jsonResponse(400, { ok: false, version: APP_VERSION, code: 'UNKNOWN_SUBSCRIPTION_ACTION', message: 'Unknown subscription action.' });
    }

    const resultRow = result.row || null;
    if (action === 'cancel_at_period_end' && resultRow?.id) {
      await sendCustomerLifecycleEmailForTenant(context.tenant.id, {
        userId: context.user?.id || '',
        type: 'cancellation_scheduled',
        idempotencyKey: `cancellation_scheduled:${resultRow.id}:${resultRow.current_period_end || 'period_end'}`,
        context: { cancellationAt: resultRow.current_period_end },
        metadata: { source: 'customer_subscription_action' }
      }).catch(() => null);
    } else if (action === 'reactivate' && resultRow?.id) {
      await sendCustomerLifecycleEmailForTenant(context.tenant.id, {
        userId: context.user?.id || '',
        type: 'subscription_reactivated',
        idempotencyKey: `subscription_reactivated:${resultRow.id}:${resultRow.current_period_end || 'current_period'}`,
        metadata: { source: 'customer_subscription_action' }
      }).catch(() => null);
    } else if (action === 'change_subscription' && result.changeMode === 'immediate' && resultRow?.id) {
      const previousPlanCode = context.subscription?.plan_code || context.tenant?.plan_code || '';
      const nextPlanCode = resultRow.plan_code || String(actionBody.planCode || '');
      if (nextPlanCode && nextPlanCode !== previousPlanCode) {
        await sendCustomerLifecycleEmailForTenant(context.tenant.id, {
          userId: context.user?.id || '',
          type: 'plan_changed',
          idempotencyKey: `plan_changed:${resultRow.id}:${resultRow.current_period_start || resultRow.updated_at || nextPlanCode}`,
          context: { previousPlanCode, planCode: nextPlanCode, billingInterval: resultRow.billing_interval || String(actionBody.billingInterval || '') },
          metadata: { source: 'customer_subscription_action' }
        }).catch(() => null);
      }
    }

    const entitlementContext = await resolveTenantEntitlements(context.tenant.id);
    await completeIdempotency(idempotencyClaim, 'completed');
    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      action,
      changeMode: result.changeMode || '',
      subscription: result.subscription || serializeSubscription(result.row, { nextInvoice: result.nextInvoice, paymentHistory: result.paymentHistory }),
      nextInvoice: result.nextInvoice || null,
      paymentHistory: result.paymentHistory || [],
      account: accountPayload(context),
      entitlements: entitlementContext.serialized,
      message: result.message || 'Subscription updated.'
    });
  } catch (error) {
    await completeIdempotency(idempotencyClaim, 'failed');
    return jsonResponse(error.status || responseStatus(error), {
      ok: false,
      version: APP_VERSION,
      code: error.code || 'STRIPE_SUBSCRIPTION_ACTION_FAILED',
      duplicateSubscriptionIds: error.subscriptionIds || [],
      message: error.message || 'The subscription action could not be completed.',
      details: error.details || null
    }, securityErrorResponseHeaders(error));
  }
}
