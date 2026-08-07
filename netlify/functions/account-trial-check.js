import { APP_VERSION, selectRows } from './_db.js';
import { finishScheduledCheck, recordFunctionFailure, recordOperationalEvent, resolveOperationalEventsByType, startScheduledCheck } from './_operations.js';

function lt(value) { return `lt.${encodeURIComponent(value)}`; }

export async function runAccountTrialCheck({ triggerSource = 'scheduled' } = {}) {
  const run = await startScheduledCheck('account_trial_lifecycle', triggerSource);
  const now = new Date().toISOString();
  try {
    const [expiredTrialTenants, staleStripeSubscriptions] = await Promise.all([
      selectRows('tenants', `select=id,plan_status,trial_ends_at&plan_status=in.(trial_active,trial_pending,trialing)&trial_ends_at=${lt(now)}&limit=500`),
      selectRows('tenant_subscriptions', `select=id,tenant_id,status,last_stripe_sync_at&provider=eq.stripe&status=in.(active,trialing,past_due,unpaid)&or=(last_stripe_sync_at.is.null,last_stripe_sync_at.lt.${encodeURIComponent(new Date(Date.now() - 24 * 3600000).toISOString())})&limit=500`)
    ]);

    const issues = Number(expiredTrialTenants.length || 0) + Number(staleStripeSubscriptions.length || 0);
    if (expiredTrialTenants.length) {
      await recordOperationalEvent({
        source: 'account_trial_check', eventType: 'expired_trial_state_stale', severity: 'warning', errorCode: 'TRIAL_STATE_STALE',
        message: `${expiredTrialTenants.length} account(s) have a trial end time in the past but still show a trial status.`,
        metadata: { affectedAccounts: expiredTrialTenants.length }
      });
    } else {
      await resolveOperationalEventsByType('account_trial_check', 'expired_trial_state_stale');
    }

    if (staleStripeSubscriptions.length) {
      await recordOperationalEvent({
        source: 'account_trial_check', eventType: 'stripe_reconciliation_stale', severity: 'warning', errorCode: 'STRIPE_SYNC_STALE',
        message: `${staleStripeSubscriptions.length} active Stripe subscription(s) have not been reconciled in the last 24 hours.`,
        metadata: { affectedSubscriptions: staleStripeSubscriptions.length }
      });
    } else {
      await resolveOperationalEventsByType('account_trial_check', 'stripe_reconciliation_stale');
    }

    await finishScheduledCheck(run, {
      status: issues ? 'warning' : 'success',
      itemsChecked: expiredTrialTenants.length + staleStripeSubscriptions.length,
      issuesFound: issues,
      summary: { staleTrialStates: expiredTrialTenants.length, staleStripeSubscriptions: staleStripeSubscriptions.length }
    });
    return { ok: true, version: APP_VERSION, checkedAt: now, issuesFound: issues, staleTrialStates: expiredTrialTenants.length, staleStripeSubscriptions: staleStripeSubscriptions.length };
  } catch (error) {
    await finishScheduledCheck(run, { status: 'failed', errorCode: error?.code || 'ACCOUNT_TRIAL_CHECK_FAILED', errorMessage: error?.message || 'Account/trial check failed.' });
    await recordFunctionFailure('account-trial-check', error, { triggerSource });
    throw error;
  }
}

export async function handler() {
  try {
    const result = await runAccountTrialCheck({ triggerSource: 'scheduled' });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: 'Scheduled account/trial check failed.' }) };
  }
}
