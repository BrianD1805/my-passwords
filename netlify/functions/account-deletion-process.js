import { APP_VERSION, deleteRow, selectRows, updateRow } from './_db.js';
import { stripeConfigured, stripeRequest } from './_stripe.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function lte(value) { return `lte.${encodeURIComponent(value)}`; }

export async function handler() {
  const now = new Date().toISOString();
  const due = await selectRows('account_deletion_requests', `select=*&status=${eq('pending')}&scheduled_for=${lte(now)}&order=scheduled_for.asc&limit=5`).catch(() => []);
  const results = [];

  for (const request of due || []) {
    if (!request?.id || !request?.tenant_id) continue;
    let stripeCancellation = { attempted: false, completed: false, error: '' };
    try {
      const claimed = await updateRow('account_deletion_requests', `id=${eq(request.id)}&status=${eq('pending')}`, { status: 'processing', updated_at: now });
      if (!claimed?.id) {
        results.push({ requestId: request.id, status: 'skipped', reason: 'Request was already claimed.' });
        continue;
      }
      const subscriptions = await selectRows('tenant_subscriptions', `select=id,provider,provider_subscription_id,status&tenant_id=${eq(request.tenant_id)}&limit=1`).catch(() => []);
      const subscription = subscriptions?.[0];
      const subscriptionStatus = String(subscription?.status || '').toLowerCase();
      const stripeAlreadyEnded = ['canceled', 'cancelled', 'ended', 'inactive', 'expired'].includes(subscriptionStatus);
      if (subscription?.provider === 'stripe' && subscription.provider_subscription_id && !stripeAlreadyEnded) {
        stripeCancellation.attempted = true;
        if (!stripeConfigured()) throw new Error('Stripe must be configured before this paid account can be deleted safely.');
        try {
          await stripeRequest(`subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, { method: 'DELETE', idempotencyKey: `mp-delete-${request.id}` });
          stripeCancellation.completed = true;
        } catch (error) {
          stripeCancellation.error = String(error.message || 'Stripe cancellation failed.').slice(0, 500);
          throw new Error(`Stripe subscription cancellation must complete before account deletion: ${stripeCancellation.error}`);
        }
      }

      await deleteRow('tenants', `id=${eq(request.tenant_id)}`);
      const completedAt = new Date().toISOString();
      await updateRow('account_deletion_requests', `id=${eq(request.id)}`, {
        status: 'completed',
        completed_at: completedAt,
        updated_at: completedAt,
        metadata: { ...(request.metadata || {}), version: APP_VERSION, stripe_cancellation: stripeCancellation }
      });
      results.push({ requestId: request.id, status: 'completed' });
    } catch (error) {
      await updateRow('account_deletion_requests', `id=${eq(request.id)}`, {
        status: 'pending',
        updated_at: new Date().toISOString(),
        metadata: { ...(request.metadata || {}), version: APP_VERSION, last_processing_error: String(error.message || error).slice(0, 800), stripe_cancellation: stripeCancellation }
      }).catch(() => null);
      results.push({ requestId: request.id, status: 'failed', error: String(error.message || error) });
    }
  }

  console.log(JSON.stringify({ version: APP_VERSION, checkedAt: now, processed: results.length, results }));
  return { statusCode: 200, body: JSON.stringify({ ok: true, version: APP_VERSION, processed: results.length, results }) };
}
