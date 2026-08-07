import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';
import { recordLifecycleEvent } from './_trial.js';
import { refreshStripeSubscriptionForTenant } from './_subscription-lifecycle.js';
import { sendCustomerLifecycleEmail } from './_customer-email.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

async function selectPaged(table, select, { order = '', pageSize = 500, maxRows = 10000 } = {}) {
  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const query = `${select}${order ? `&order=${order}` : ''}&limit=${pageSize}&offset=${offset}`;
    const page = await selectRows(table, query);
    rows.push(...(page || []));
    if (!page || page.length < pageSize) break;
  }
  return rows;
}

function userForTenant(usersByTenant, tenantId) {
  const users = usersByTenant.get(tenantId) || [];
  return users.find((user) => user.email && user.email_verified)
    || users.find((user) => user.email)
    || users[0]
    || null;
}

function planName(plansByCode, code) {
  return plansByCode.get(code)?.display_name || code || 'My Passwords';
}

async function safeSend(options, results) {
  try {
    const delivery = await sendCustomerLifecycleEmail(options);
    results.push({ type: options.type, tenantId: options.tenantId || '', sent: Boolean(delivery.sent), skipped: Boolean(delivery.skipped), reason: delivery.reason || '' });
    return delivery;
  } catch (error) {
    results.push({ type: options.type, tenantId: options.tenantId || '', sent: false, reason: error.message || 'Email processing failed.' });
    return { sent: false, reason: error.message || 'Email processing failed.' };
  }
}

async function retryFailedEmailRows(results, source) {
  const rows = await selectRows('customer_email_log', 'select=*&status=in.(failed,sending)&attempts=lt.5&tenant_id=not.is.null&order=last_attempt_at.asc&limit=200');
  const staleSendingBefore = Date.now() - 15 * 60 * 1000;
  for (const row of rows || []) {
    if (row.metadata?.security_copy) continue;
    if (row.status === 'sending') {
      const lastAttempt = row.last_attempt_at ? new Date(row.last_attempt_at).getTime() : 0;
      if (Number.isFinite(lastAttempt) && lastAttempt > staleSendingBefore) continue;
    }
    const delivery = await safeSend({
      tenantId: row.tenant_id,
      userId: row.user_id || '',
      type: row.email_type,
      idempotencyKey: row.idempotency_key,
      context: row.metadata?.template_context || {},
      metadata: { ...(row.metadata || {}), retry_source: source }
    }, results);
    if (delivery?.sent && row.user_id && ['welcome_trial_started', 'welcome_account_activated'].includes(row.email_type)) {
      await updateRow('users', `id=${eq(row.user_id)}&tenant_id=${eq(row.tenant_id)}`, { welcome_email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).catch(() => null);
    }
  }
}

async function startProcessorRun(processorType, triggerSource) {
  return insertRow('email_processor_runs', {
    id: publicId('email_processor_run'),
    processor_type: processorType,
    trigger_source: triggerSource,
    status: 'running',
    started_at: new Date().toISOString(),
    result_summary: {},
    created_at: new Date().toISOString()
  }).catch(() => null);
}

async function finishProcessorRun(run, values) {
  if (!run?.id) return null;
  return updateRow('email_processor_runs', `id=${eq(run.id)}`, {
    ...values,
    finished_at: new Date().toISOString()
  }).catch(() => null);
}

export async function runCustomerLifecycleEmailProcessor({ triggerSource = 'scheduled' } = {}) {
  const startedAt = new Date().toISOString();
  const source = triggerSource === 'admin' ? 'admin_lifecycle_processor' : 'scheduled_lifecycle_processor';
  const run = await startProcessorRun('customer_lifecycle', triggerSource);
  const results = [];
  try {
    const [tenants, subscriptions, users, plans] = await Promise.all([
      selectPaged('tenants', 'select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at,created_at,updated_at', { order: 'created_at.asc' }),
      selectPaged('tenant_subscriptions', 'select=id,tenant_id,plan_code,status,billing_interval,currency,price_minor,trial_started_at,trial_ends_at,current_period_start,current_period_end,cancel_at_period_end,cancelled_at,grace_period_ends_at,provider,provider_subscription_id,last_payment_failed_at,next_invoice_amount_minor,next_invoice_currency,next_invoice_at,updated_at', { order: 'updated_at.asc' }),
      selectPaged('users', 'select=id,tenant_id,email,display_name,email_verified,first_tenant_owner,welcome_email_sent_at,onboarding_completed_at,created_at,updated_at', { order: 'created_at.asc' }),
      selectRows('subscription_plans', 'select=code,display_name,currency&limit=500')
    ]);

    const subscriptionByTenant = new Map((subscriptions || []).map((row) => [row.tenant_id, row]));
    const usersByTenant = new Map();
    for (const user of users || []) {
      if (!usersByTenant.has(user.tenant_id)) usersByTenant.set(user.tenant_id, []);
      usersByTenant.get(user.tenant_id).push(user);
    }
    const plansByCode = new Map((plans || []).map((plan) => [plan.code, plan]));
    const nowMs = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    for (const tenant of tenants || []) {
      const user = userForTenant(usersByTenant, tenant.id);
      if (!user?.email || !user.email_verified) continue;
      let subscription = subscriptionByTenant.get(tenant.id) || null;
      const status = String(subscription?.status || tenant.plan_status || '').toLowerCase();
      const trialEndsAt = subscription?.trial_ends_at || tenant.trial_ends_at || null;
      const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
      const activeTrial = ['trialing', 'trial_active', 'trial_pending'].includes(status) || String(tenant.plan_status || '').toLowerCase() === 'trial_active';

      if (activeTrial && Number.isFinite(trialEndMs) && trialEndMs > nowMs && trialEndMs - nowMs <= threeDaysMs) {
        await safeSend({
          tenantId: tenant.id, userId: user.id, type: 'trial_ending_soon',
          idempotencyKey: `trial_ending_soon:${tenant.id}:${trialEndsAt}`,
          context: { displayName: user.display_name, accountName: tenant.account_name || tenant.name, planName: planName(plansByCode, subscription?.plan_code || tenant.plan_code), trialEndsAt },
          metadata: { source }
        }, results);
      }

      if (activeTrial && Number.isFinite(trialEndMs) && trialEndMs <= nowMs) {
        if (subscription?.provider === 'stripe' && subscription?.provider_subscription_id) {
          const refreshed = await refreshStripeSubscriptionForTenant(tenant.id).catch(() => null);
          if (refreshed?.row) {
            subscription = refreshed.row;
            subscriptionByTenant.set(tenant.id, subscription);
            const refreshedStatus = String(subscription.status || '').toLowerCase();
            if (refreshedStatus === 'active') {
              await safeSend({ tenantId: tenant.id, userId: user.id, type: 'subscription_activated', idempotencyKey: `subscription_activated:${subscription.provider_subscription_id}:${subscription.current_period_start || subscription.updated_at || 'active'}`, metadata: { source: triggerSource === 'admin' ? 'admin_trial_end_reconciliation' : 'trial_end_reconciliation' } }, results);
            } else if (['past_due', 'unpaid'].includes(refreshedStatus)) {
              const failureKey = subscription.last_payment_failed_at || subscription.updated_at || trialEndsAt;
              await safeSend({ tenantId: tenant.id, userId: user.id, type: 'payment_failed', idempotencyKey: `payment_failed:${subscription.id}:${failureKey}`, metadata: { source: triggerSource === 'admin' ? 'admin_trial_end_reconciliation' : 'trial_end_reconciliation' } }, results);
              if (subscription.grace_period_ends_at) await safeSend({ tenantId: tenant.id, userId: user.id, type: 'grace_period_started', idempotencyKey: `grace_period_started:${subscription.id}:${failureKey}`, metadata: { source: triggerSource === 'admin' ? 'admin_trial_end_reconciliation' : 'trial_end_reconciliation' } }, results);
            }
          }
        } else {
          const now = new Date().toISOString();
          await updateRow('tenants', `id=${eq(tenant.id)}`, { status: 'trial_expired', account_status: 'trial_expired', plan_status: 'trial_expired', updated_at: now }).catch(() => null);
          if (subscription?.id) await updateRow('tenant_subscriptions', `id=${eq(subscription.id)}`, { status: 'trial_expired', updated_at: now }).catch(() => null);
          await recordLifecycleEvent({ tenantId: tenant.id, subscriptionId: subscription?.id || null, eventType: 'trial_expired', status: 'recorded', metadata: { trial_ends_at: trialEndsAt, source } }).catch(() => null);
          await safeSend({ tenantId: tenant.id, userId: user.id, type: 'trial_expired', idempotencyKey: `trial_expired:${tenant.id}:${trialEndsAt}`, context: { trialEndsAt }, metadata: { source } }, results);
        }
      }

      const paidStatus = String(subscription?.status || '').toLowerCase();
      if (subscription?.provider === 'stripe' && ['active', 'trialing'].includes(paidStatus) && subscription.cancel_at_period_end) {
        await safeSend({ tenantId: tenant.id, userId: user.id, type: 'cancellation_scheduled', idempotencyKey: `cancellation_scheduled:${subscription.id}:${subscription.current_period_end || 'period_end'}`, context: { cancellationAt: subscription.current_period_end }, metadata: { source } }, results);
      }

      if (subscription?.provider === 'stripe' && paidStatus === 'active' && !subscription.cancel_at_period_end) {
        const renewalAt = subscription.next_invoice_at || subscription.current_period_end || null;
        const renewalMs = renewalAt ? new Date(renewalAt).getTime() : NaN;
        if (Number.isFinite(renewalMs) && renewalMs > nowMs && renewalMs - nowMs <= sevenDaysMs) {
          await safeSend({
            tenantId: tenant.id, userId: user.id, type: 'upcoming_renewal',
            idempotencyKey: `upcoming_renewal:${subscription.id}:${subscription.current_period_end || renewalAt}`,
            context: { renewalAt, amountMinor: subscription.next_invoice_amount_minor ?? subscription.price_minor, currency: subscription.next_invoice_currency || subscription.currency },
            metadata: { source }
          }, results);
        }
      }

      if (subscription?.provider === 'stripe' && ['past_due', 'unpaid'].includes(paidStatus) && subscription.last_payment_failed_at) {
        await safeSend({ tenantId: tenant.id, userId: user.id, type: 'payment_failed', idempotencyKey: `payment_failed:${subscription.id}:${subscription.last_payment_failed_at}`, metadata: { source } }, results);
        if (subscription.grace_period_ends_at) await safeSend({ tenantId: tenant.id, userId: user.id, type: 'grace_period_started', idempotencyKey: `grace_period_started:${subscription.id}:${subscription.last_payment_failed_at}`, context: { gracePeriodEndsAt: subscription.grace_period_ends_at }, metadata: { source } }, results);
      }

      if (subscription?.provider === 'stripe' && ['cancelled', 'canceled', 'incomplete_expired'].includes(paidStatus) && subscription.cancelled_at) {
        const cancelledMs = new Date(subscription.cancelled_at).getTime();
        if (Number.isFinite(cancelledMs) && nowMs - cancelledMs <= 48 * 60 * 60 * 1000) {
          await safeSend({ tenantId: tenant.id, userId: user.id, type: 'subscription_cancelled', idempotencyKey: `subscription_cancelled:${subscription.id}:${subscription.cancelled_at}`, metadata: { source } }, results);
        }
      }
    }

    await retryFailedEmailRows(results, source);

    const finishedAt = new Date().toISOString();
    const sent = results.filter((row) => row.sent).length;
    const skipped = results.filter((row) => row.skipped).length;
    const failed = results.length - sent - skipped;
    const payload = { ok: true, version: APP_VERSION, startedAt, finishedAt, triggerSource, tenantsChecked: tenants.length, emailActions: results.length, sent, skipped, failed, results };
    await finishProcessorRun(run, { status: 'success', items_checked: tenants.length, email_actions: results.length, result_summary: { sent, skipped, failed } });
    console.log(JSON.stringify(payload));
    return payload;
  } catch (error) {
    await finishProcessorRun(run, { status: 'failed', error_message: String(error.message || 'Lifecycle email processor failed.').slice(0, 1000), result_summary: { completedActions: results.length } });
    throw error;
  }
}

export async function handler() {
  try {
    const result = await runCustomerLifecycleEmailProcessor({ triggerSource: 'scheduled' });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: error.message || 'Customer lifecycle email processor failed.' }) };
  }
}
