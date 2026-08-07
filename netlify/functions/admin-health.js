import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateAdminSession } from './_admin-session.js';
import { assertBrowserAction } from './_security.js';
import { stripeConfigured, stripeRequest } from './_stripe.js';
import { internalSubscriptionStatus, refreshStripeSubscriptionForTenant, subscriptionPeriod, subscriptionPrice } from './_subscription-lifecycle.js';
import { resolveOperationalEvent, sanitiseOperationalMetadata, sanitiseOperationalText } from './_operations.js';
import { runOperationsHealthCheck } from './operations-health-check.js';
import { runAccountTrialCheck } from './account-trial-check.js';
import { runDatabaseBackupVerification } from './database-backup-verify.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function dateMs(value) { const ms = value ? new Date(value).getTime() : 0; return Number.isFinite(ms) ? ms : 0; }

async function audit(session, action, metadata = {}) {
  return insertRow('audit_log', {
    id: publicId('audit'), tenant_id: metadata.tenant_id || null, user_id: null, action,
    metadata: sanitiseOperationalMetadata({ version: APP_VERSION, actor: 'owner_admin', admin_session_issued_at: session?.iat ? new Date(Number(session.iat) * 1000).toISOString() : null, ...metadata })
  }).catch(() => null);
}

function parseJson(value) { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return {}; } }

function localStripeSnapshot(row, planName = '') {
  if (!row) return {};
  return {
    status: String(row.status || ''), planCode: String(row.plan_code || ''), planName: String(planName || ''), billingInterval: String(row.billing_interval || ''),
    currency: String(row.currency || 'GBP').toUpperCase(), priceMinor: Number(row.price_minor || 0), currentPeriodEnd: row.current_period_end || null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end), providerSubscriptionId: String(row.provider_subscription_id || ''),
    lastStripeSyncAt: row.last_stripe_sync_at || null, duplicateSubscriptionCount: Number(row.duplicate_subscription_count || 0)
  };
}

function intervalFromPrice(price) {
  if (price.interval === 'year' && price.intervalCount === 1) return 'annual';
  if (price.interval === 'month' && price.intervalCount === 3) return 'quarterly';
  if (price.interval === 'month' && price.intervalCount === 1) return 'monthly';
  return '';
}

function providerStripeSnapshot(subscription, plans = []) {
  const price = subscriptionPrice(subscription);
  const period = subscriptionPeriod(subscription);
  const plan = plans.find((row) => [row.stripe_monthly_price_id, row.stripe_quarterly_price_id, row.stripe_annual_price_id].includes(price.id)) || null;
  return {
    status: internalSubscriptionStatus(subscription?.status), planCode: plan?.code || '', planName: plan?.display_name || '',
    billingInterval: intervalFromPrice(price), currency: String(price.currency || 'GBP').toUpperCase(), priceMinor: Number(price.amountMinor || 0),
    currentPeriodEnd: period.end || null, cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end), providerSubscriptionId: String(subscription?.id || '')
  };
}

export function reconciliationValuesEqual(field, localValue, providerValue) {
  if (field === 'currentPeriodEnd') {
    if (!localValue && !providerValue) return true;
    const localMs = localValue ? new Date(localValue).getTime() : NaN;
    const providerMs = providerValue ? new Date(providerValue).getTime() : NaN;
    return Number.isFinite(localMs) && Number.isFinite(providerMs) && localMs === providerMs;
  }
  return String(localValue ?? '') === String(providerValue ?? '');
}

export function reconciliationChanges(local, provider) {
  const fields = ['status', 'planCode', 'billingInterval', 'currency', 'priceMinor', 'currentPeriodEnd', 'cancelAtPeriodEnd'];
  return fields.filter((field) => !reconciliationValuesEqual(field, local?.[field], provider?.[field])).map((field) => ({ field, local: local?.[field] ?? null, provider: provider?.[field] ?? null }));
}

async function loadHealthData() {
  const [events, checks, webhooks, customerEmailFailures, adminEmailFailures, syncIssues, tenants, subscriptions, plans, reconciliations] = await Promise.all([
    selectRows('operational_events', 'select=*&order=last_seen_at.desc&limit=250'),
    selectRows('scheduled_check_runs', 'select=*&order=started_at.desc&limit=250'),
    selectRows('stripe_webhook_events', 'select=id,event_id,event_type,status,attempts,error_message,first_received_at,last_attempt_at,processed_at,updated_at&order=updated_at.desc&limit=100'),
    selectRows('customer_email_log', 'select=id,tenant_id,email_type,status,attempts,error_message,last_attempt_at,created_at&status=eq.failed&order=last_attempt_at.desc&limit=100'),
    selectRows('admin_email_log', 'select=id,tenant_id,email_type,status,error_message,created_at&status=eq.failed&order=created_at.desc&limit=100'),
    selectRows('vault_sync_events', 'select=id,tenant_id,user_id,event_type,status,item_count,message,device_id,created_at&or=(status.eq.error,status.eq.warning,event_type.eq.backup_conflict_blocked)&order=created_at.desc&limit=150'),
    selectRows('tenants', 'select=id,name,account_name,plan_code,plan_status,account_status&order=account_name.asc&limit=1000'),
    selectRows('tenant_subscriptions', 'select=*&provider=eq.stripe&order=updated_at.desc&limit=1000'),
    selectRows('subscription_plans', 'select=code,display_name,stripe_monthly_price_id,stripe_quarterly_price_id,stripe_annual_price_id&limit=250'),
    selectRows('stripe_reconciliation_runs', 'select=id,tenant_id,subscription_id,status,changes,error_message,started_at,expires_at,finished_at&order=started_at.desc&limit=50')
  ]);

  const openEvents = events.filter((row) => row.status === 'open');
  const criticalOpen = openEvents.filter((row) => row.severity === 'critical').length;
  const errorOpen = openEvents.filter((row) => row.severity === 'error').length;
  const warningOpen = openEvents.filter((row) => row.severity === 'warning').length;
  const failedWebhooks = webhooks.filter((row) => row.status === 'failed');
  const backupFailures = syncIssues.filter((row) => row.status === 'error' || row.event_type === 'backup_failure');
  const conflicts = syncIssues.filter((row) => row.event_type === 'backup_conflict_blocked');
  const latestByType = {};
  for (const row of checks) if (!latestByType[row.check_type]) latestByType[row.check_type] = row;
  const latestBackupRun = latestByType.database_backup_verification || null;
  const backupSummary = parseJson(latestBackupRun?.result_summary);

  const tenantById = new Map(tenants.map((row) => [row.id, row]));
  const planByCode = new Map(plans.map((row) => [row.code, row]));
  const stripeCustomers = subscriptions.filter((row) => row.provider_subscription_id).map((row) => ({
    value: row.tenant_id,
    label: tenantById.get(row.tenant_id)?.account_name || tenantById.get(row.tenant_id)?.name || row.tenant_id,
    status: row.status || '',
    plan: planByCode.get(row.plan_code)?.display_name || row.plan_code || '',
    lastStripeSyncAt: row.last_stripe_sync_at || null
  })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  const overallStatus = criticalOpen ? 'critical' : errorOpen ? 'attention' : warningOpen ? 'warning' : 'healthy';
  return {
    overallStatus,
    summary: {
      openOperationalEvents: openEvents.length, criticalOpen, errorOpen, warningOpen,
      failedStripeWebhooks: failedWebhooks.length,
      resendFailures: customerEmailFailures.length + adminEmailFailures.length,
      backupFailures: backupFailures.length,
      syncConflicts: conflicts.length,
      functionFailures: openEvents.filter((row) => row.event_type === 'function_failure').length
    },
    services: {
      database: { status: latestByType.operations_health?.result_summary?.databaseReachable === false ? 'error' : 'ready', label: 'Supabase data plane' },
      stripe: { status: !stripeConfigured() ? 'not_configured' : failedWebhooks.length ? 'error' : 'ready', label: 'Stripe and webhooks' },
      resend: { status: !(process.env.RESEND_API_KEY && process.env.OTP_EMAIL_FROM) ? 'not_configured' : (customerEmailFailures.length + adminEmailFailures.length ? 'warning' : 'ready'), label: 'Resend delivery' },
      operationalAlerts: { status: process.env.OPS_ALERT_EMAIL && process.env.RESEND_API_KEY && process.env.OTP_EMAIL_FROM ? 'ready' : 'not_configured', label: 'Operational alert email', message: process.env.OPS_ALERT_EMAIL ? 'Critical Stripe webhook alerts can be emailed to the configured operations recipient.' : 'Optional: add OPS_ALERT_EMAIL to receive Stripe webhook failure alert emails.' },
      databaseBackup: { status: backupSummary.status || latestBackupRun?.status || 'not_checked', label: 'Database backup verification', latestBackupAt: backupSummary.latestBackupAt || null, message: backupSummary.message || '' }
    },
    events: events.map((row) => ({ ...row, metadata: parseJson(row.metadata) })),
    checks: checks.map((row) => ({ ...row, result_summary: parseJson(row.result_summary) })),
    webhooks: webhooks.slice(0, 50),
    emailFailures: [...customerEmailFailures, ...adminEmailFailures].sort((a, b) => dateMs(b.last_attempt_at || b.created_at) - dateMs(a.last_attempt_at || a.created_at)).slice(0, 100),
    syncIssues: syncIssues.slice(0, 100),
    stripeCustomers,
    reconciliations: reconciliations.map((row) => ({ ...row, changes: parseJson(row.changes) })),
    retentionPolicy: [
      { severity: 'Info', days: 30 }, { severity: 'Warning', days: 90 }, { severity: 'Error', days: 180 }, { severity: 'Critical', days: 365 },
      { severity: 'Scheduled check runs', days: 180 }, { severity: 'Stripe reconciliation records', days: 365 }
    ],
    safety: {
      diagnosticsMetadataOnly: true,
      vaultContentCollected: false,
      decryptedDataCollected: false,
      secretsCollected: false,
      message: 'Operational monitoring stores metadata only. Vault contents, encrypted payloads, document contents, master passwords, OTPs, recovery codes and provider secrets are excluded.'
    }
  };
}

async function createStripePreview(tenantId) {
  if (!stripeConfigured()) throw Object.assign(new Error('Stripe Billing is not configured.'), { status: 503 });
  const rows = await selectRows('tenant_subscriptions', `select=*&tenant_id=${eq(tenantId)}&provider=eq.stripe&limit=1`);
  const localRow = rows?.[0];
  if (!localRow?.id || !localRow.provider_subscription_id) throw Object.assign(new Error('This customer does not have a linked Stripe subscription.'), { status: 409 });
  const plans = await selectRows('subscription_plans', 'select=code,display_name,stripe_monthly_price_id,stripe_quarterly_price_id,stripe_annual_price_id&limit=250');
  const provider = await stripeRequest(`subscriptions/${encodeURIComponent(localRow.provider_subscription_id)}`, { method: 'GET', params: { expand: ['items.data.price'] } });
  if (!provider?.id || provider.id !== localRow.provider_subscription_id) throw Object.assign(new Error('Stripe returned an unexpected subscription reference.'), { status: 409 });
  const localPlan = plans.find((row) => row.code === localRow.plan_code);
  const local = localStripeSnapshot(localRow, localPlan?.display_name || '');
  const providerSnapshot = providerStripeSnapshot(provider, plans);
  const changes = reconciliationChanges(local, providerSnapshot);
  const now = new Date();
  const run = await insertRow('stripe_reconciliation_runs', {
    id: publicId('stripe_reconcile'), tenant_id: tenantId, subscription_id: localRow.id, provider_subscription_id: localRow.provider_subscription_id,
    trigger_source: 'admin', status: 'preview', local_snapshot: local, provider_snapshot: providerSnapshot, changes,
    started_at: now.toISOString(), expires_at: new Date(now.getTime() + 10 * 60000).toISOString(), created_at: now.toISOString(), updated_at: now.toISOString()
  });
  return { run, local, provider: providerSnapshot, changes };
}

async function applyStripePreview(runId) {
  const rows = await selectRows('stripe_reconciliation_runs', `select=*&id=${eq(runId)}&status=eq.preview&limit=1`);
  const run = rows?.[0];
  if (!run?.id) throw Object.assign(new Error('The reconciliation preview is no longer available.'), { status: 409 });
  if (dateMs(run.expires_at) <= Date.now()) {
    await updateRow('stripe_reconciliation_runs', `id=${eq(run.id)}`, { status: 'expired', finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).catch(() => null);
    throw Object.assign(new Error('The reconciliation preview expired. Run a new preview before applying changes.'), { status: 409 });
  }
  const localRows = await selectRows('tenant_subscriptions', `select=*&tenant_id=${eq(run.tenant_id)}&limit=1`);
  const current = localRows?.[0];
  if (!current?.id || current.id !== run.subscription_id || current.provider_subscription_id !== run.provider_subscription_id) {
    throw Object.assign(new Error('The local subscription changed after the preview. Run a new preview.'), { status: 409 });
  }
  const result = await refreshStripeSubscriptionForTenant(run.tenant_id);
  const after = localStripeSnapshot(result.row || null);
  const before = parseJson(run.local_snapshot);
  const actualChanges = reconciliationChanges(before, after);
  await updateRow('stripe_reconciliation_runs', `id=${eq(run.id)}`, { status: 'applied', changes: actualChanges, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return { tenantId: run.tenant_id, runId: run.id, before, after, changes: actualChanges, message: result.message || 'Stripe subscription metadata reconciled.' };
}

export async function handler(event) {
  const validation = await validateAdminSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'ADMIN_SESSION_REQUIRED', message: 'Admin sign-in is required.' });
  const session = validation.session;

  if (event.httpMethod === 'GET') {
    try { return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await loadHealthData()) }); }
    catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load operational health data.', code: error?.code || 'ADMIN_HEALTH_LOAD_FAILED' }); }
  }
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  try { assertBrowserAction(event, { session, kind: 'admin', csrf: true }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }

  const body = parseBody(event);
  const action = sanitiseOperationalText(body.action, 80);
  try {
    if (action === 'run_health_check') {
      const accountTrial = await runAccountTrialCheck({ triggerSource: 'admin' });
      const databaseBackup = await runDatabaseBackupVerification({ triggerSource: 'admin' });
      const health = await runOperationsHealthCheck({ triggerSource: 'admin' });
      await audit(session, 'admin_operational_health_check_run', { issues: Number(accountTrial.issuesFound || 0) + Number(health.issuesFound || 0), database_backup_status: databaseBackup.status });
      return jsonResponse(200, { ok: true, version: APP_VERSION, accountTrial, databaseBackup, health, message: 'Operational health checks completed.' });
    }
    if (action === 'resolve_event') {
      const eventId = sanitiseOperationalText(body.eventId, 180);
      if (!eventId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'An operational event is required.' });
      const updated = await resolveOperationalEvent(eventId, body.note || 'Acknowledged and resolved by Owner Admin.');
      await audit(session, 'admin_operational_event_resolved', { event_id: eventId });
      return jsonResponse(200, { ok: true, version: APP_VERSION, event: updated, message: 'Operational event marked resolved.' });
    }
    if (action === 'preview_stripe_reconciliation') {
      const tenantId = sanitiseOperationalText(body.tenantId, 180);
      if (!tenantId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Choose a Stripe customer first.' });
      const preview = await createStripePreview(tenantId);
      await audit(session, 'admin_stripe_reconciliation_previewed', { tenant_id: tenantId, reconciliation_id: preview.run.id, changes: preview.changes.map((row) => row.field) });
      return jsonResponse(200, { ok: true, version: APP_VERSION, preview: { runId: preview.run.id, expiresAt: preview.run.expires_at, local: preview.local, provider: preview.provider, changes: preview.changes }, message: preview.changes.length ? 'Preview ready. Review the differences before applying.' : 'Stripe and My Passwords already match. No changes are required.' });
    }
    if (action === 'apply_stripe_reconciliation') {
      const runId = sanitiseOperationalText(body.runId, 220);
      if (!runId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Run a Stripe reconciliation preview first.' });
      const result = await applyStripePreview(runId);
      await audit(session, 'admin_stripe_reconciliation_applied', { tenant_id: result.tenantId, reconciliation_id: runId, changes: result.changes.map((row) => row.field) });
      return jsonResponse(200, { ok: true, version: APP_VERSION, result, message: result.changes.length ? 'Stripe metadata reconciliation applied safely.' : 'Reconciliation completed. No local billing changes were required.' });
    }
    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown operational health action.' });
  } catch (error) {
    if (action === 'apply_stripe_reconciliation' && body.runId) await updateRow('stripe_reconciliation_runs', `id=${eq(sanitiseOperationalText(body.runId, 220))}`, { status: 'failed', error_message: sanitiseOperationalText(error.message, 800), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).catch(() => null);
    await audit(session, 'admin_operational_health_action_failed', { action, error_code: error?.code || error?.name || 'ADMIN_HEALTH_ACTION_FAILED' });
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, code: error?.code || 'ADMIN_HEALTH_ACTION_FAILED', message: error.message || 'Operational health action failed.' });
  }
}
