import { APP_VERSION, selectRows, updateRow } from './_db.js';
import { stripeConfigured } from './_stripe.js';
import { finishScheduledCheck, recordFunctionFailure, recordOperationalEvent, resolveOperationalEventsByType, sanitiseOperationalMetadata, startScheduledCheck } from './_operations.js';
import { sendOperationalAlert } from './_operational-alert.js';

function gte(value) { return `gte.${encodeURIComponent(value)}`; }

export async function runOperationsHealthCheck({ triggerSource = 'scheduled' } = {}) {
  const run = await startScheduledCheck('operations_health', triggerSource);
  const since24h = new Date(Date.now() - 24 * 3600000).toISOString();
  try {
    const [dbProbe, failedWebhooks, failedCustomerEmails, failedAdminEmails, backupFailures, syncConflicts, functionFailures, processorRuns] = await Promise.all([
      selectRows('tenants', 'select=id&limit=1').then(() => true).catch(() => false),
      selectRows('stripe_webhook_events', 'select=id,event_id,event_type,attempts,error_message,updated_at&status=eq.failed&order=updated_at.desc&limit=100'),
      selectRows('customer_email_log', `select=id,status,email_type,last_attempt_at&status=eq.failed&last_attempt_at=${gte(since24h)}&limit=500`),
      selectRows('admin_email_log', `select=id,status,email_type,created_at&status=eq.failed&created_at=${gte(since24h)}&limit=500`),
      selectRows('vault_sync_events', `select=id,event_type,status,created_at&status=eq.error&created_at=${gte(since24h)}&limit=500`),
      selectRows('vault_sync_events', `select=id,event_type,status,created_at&event_type=eq.backup_conflict_blocked&created_at=${gte(since24h)}&limit=500`),
      selectRows('operational_events', `select=id,source,event_type,severity,last_seen_at&event_type=eq.function_failure&status=eq.open&last_seen_at=${gte(since24h)}&limit=500`),
      selectRows('email_processor_runs', 'select=processor_type,status,finished_at,started_at&order=started_at.desc&limit=50')
    ]);

    const lifecycleSuccess = processorRuns.find((row) => row.processor_type === 'customer_lifecycle' && row.status === 'success');
    const emergencySuccess = processorRuns.find((row) => row.processor_type === 'emergency_access_release' && row.status === 'success');
    const lifecycleStale = !lifecycleSuccess?.finished_at || Date.now() - new Date(lifecycleSuccess.finished_at).getTime() > 2 * 3600000;
    const emergencyStale = !emergencySuccess?.finished_at || Date.now() - new Date(emergencySuccess.finished_at).getTime() > 20 * 60000;
    const emailFailures = failedCustomerEmails.length + failedAdminEmails.length;

    const alerts = [
      { condition: !dbProbe, source: 'operations_health', type: 'database_unreachable', severity: 'critical', code: 'DATABASE_UNREACHABLE', message: 'The operational health check could not read the Supabase database.' },
      { condition: failedWebhooks.length > 0, source: 'stripe_webhook', type: 'stripe_webhook_failure_alert', severity: 'critical', code: 'STRIPE_WEBHOOK_FAILED', message: `${failedWebhooks.length} Stripe webhook event(s) are currently failed.` },
      { condition: emailFailures > 0, source: 'resend', type: 'resend_delivery_failures', severity: 'error', code: 'EMAIL_DELIVERY_FAILED', message: `${emailFailures} email delivery failure(s) were recorded in the last 24 hours.` },
      { condition: backupFailures.length > 0, source: 'vault_backup', type: 'backup_failures', severity: 'error', code: 'VAULT_BACKUP_FAILED', message: `${backupFailures.length} vault backup failure(s) were recorded in the last 24 hours.` },
      { condition: syncConflicts.length > 0, source: 'vault_sync', type: 'sync_conflicts', severity: 'warning', code: 'SYNC_CONFLICT', message: `${syncConflicts.length} blocked sync conflict(s) were recorded in the last 24 hours.` },
      { condition: lifecycleStale, source: 'scheduled_checks', type: 'lifecycle_processor_stale', severity: 'error', code: 'LIFECYCLE_PROCESSOR_STALE', message: 'The customer lifecycle processor has no successful run within the expected two-hour window.' },
      { condition: emergencyStale, source: 'scheduled_checks', type: 'emergency_processor_stale', severity: 'critical', code: 'EMERGENCY_PROCESSOR_STALE', message: 'The Emergency Access processor has no successful run within the expected twenty-minute window.' }
    ];

    for (const alert of alerts) {
      if (alert.condition) {
        const eventRow = await recordOperationalEvent({ source: alert.source, eventType: alert.type, severity: alert.severity, errorCode: alert.code, message: alert.message });
        if (alert.type === 'stripe_webhook_failure_alert' && eventRow?.id && process.env.OPS_ALERT_EMAIL) {
          const metadata = eventRow.metadata && typeof eventRow.metadata === 'object' ? eventRow.metadata : {};
          const lastAttemptMs = metadata.alertEmailLastAttemptAt ? new Date(metadata.alertEmailLastAttemptAt).getTime() : 0;
          if (!Number.isFinite(lastAttemptMs) || Date.now() - lastAttemptMs >= 6 * 3600000) {
            const attemptedAt = new Date().toISOString();
            const delivery = await sendOperationalAlert({
              subject: 'My Passwords: Stripe webhook failure alert',
              heading: 'Stripe webhook failure detected',
              message: `${failedWebhooks.length} Stripe webhook event(s) are currently marked failed. Review Admin > Health before making any billing changes.`,
              idempotencyKey: `ops-stripe-webhook/${eventRow.id}/${attemptedAt.slice(0, 13)}`
            });
            await updateRow('operational_events', `id=eq.${encodeURIComponent(eventRow.id)}`, {
              metadata: sanitiseOperationalMetadata({ ...metadata, alertEmailLastAttemptAt: attemptedAt, alertEmailSentAt: delivery.sent ? attemptedAt : (metadata.alertEmailSentAt || null) }),
              updated_at: attemptedAt
            }).catch(() => null);
            if (!delivery.sent && !delivery.skipped) {
              await recordOperationalEvent({
                source: 'resend', eventType: 'resend_delivery_failure', severity: 'error', errorCode: delivery.errorCode || 'OPS_ALERT_EMAIL_FAILED',
                message: 'An operational alert email could not be delivered.', metadata: { emailType: 'stripe_webhook_failure_alert', httpStatus: delivery.status || 0 }
              });
            }
          }
        }
      } else {
        await resolveOperationalEventsByType(alert.source, alert.type);
        if (alert.type === 'stripe_webhook_failure_alert') await resolveOperationalEventsByType('stripe_webhook', 'stripe_webhook_processing_failure');
      }
    }

    const issues = alerts.filter((row) => row.condition).length + functionFailures.length;
    const critical = alerts.some((row) => row.condition && row.severity === 'critical');
    const status = critical ? 'failed' : issues ? 'warning' : 'success';
    const summary = {
      databaseReachable: dbProbe,
      stripeConfigured: stripeConfigured(),
      resendConfigured: Boolean(process.env.RESEND_API_KEY && process.env.OTP_EMAIL_FROM),
      failedStripeWebhooks: failedWebhooks.length,
      resendFailures24h: emailFailures,
      backupFailures24h: backupFailures.length,
      syncConflicts24h: syncConflicts.length,
      functionFailures24h: functionFailures.length,
      lifecycleProcessorStale: lifecycleStale,
      emergencyProcessorStale: emergencyStale
    };
    await finishScheduledCheck(run, { status, itemsChecked: 8, issuesFound: issues, summary });
    return { ok: status !== 'failed', version: APP_VERSION, status, checkedAt: new Date().toISOString(), issuesFound: issues, summary };
  } catch (error) {
    await finishScheduledCheck(run, { status: 'failed', errorCode: error?.code || 'OPERATIONS_HEALTH_FAILED', errorMessage: error?.message || 'Operations health check failed.' });
    await recordFunctionFailure('operations-health-check', error, { triggerSource });
    if (process.env.OPS_ALERT_EMAIL) {
      await sendOperationalAlert({
        subject: 'My Passwords: operational health check failed',
        heading: 'Operational health check failed',
        message: 'The scheduled My Passwords health check could not complete. Open Admin > Health and check Netlify/Supabase service status.',
        idempotencyKey: `ops-health-failed/${new Date().toISOString().slice(0, 13)}`
      }).catch(() => null);
    }
    throw error;
  }
}

export async function handler() {
  try {
    const result = await runOperationsHealthCheck({ triggerSource: 'scheduled' });
    return { statusCode: result.ok ? 200 : 503, body: JSON.stringify(result) };
  } catch {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: 'Operations health check failed.' }) };
  }
}
