import { APP_VERSION, supabaseRequest } from './_db.js';
import { finishScheduledCheck, recordFunctionFailure, startScheduledCheck } from './_operations.js';

async function deleteRows(path) {
  const result = await supabaseRequest(`${path}&select=id`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  return Array.isArray(result) ? result.length : 0;
}

export async function runOperationalRetentionCleanup({ triggerSource = 'scheduled' } = {}) {
  const run = await startScheduledCheck('operational_retention_cleanup', triggerSource);
  try {
    const now = new Date().toISOString();
    const metadataBefore = new Date(Date.now() - 180 * 86400000).toISOString();
    const reconciliationsBefore = new Date(Date.now() - 365 * 86400000).toISOString();
    const deletionHistoryBefore = new Date(Date.now() - 365 * 86400000).toISOString();
    const [eventsDeleted, checksDeleted, reconciliationsDeleted, customerEmailsDeleted, adminEmailsDeleted, smsLogsDeleted, deletionRequestsDeleted] = await Promise.all([
      deleteRows(`operational_events?retention_until=lt.${encodeURIComponent(now)}`),
      deleteRows(`scheduled_check_runs?created_at=lt.${encodeURIComponent(metadataBefore)}`),
      deleteRows(`stripe_reconciliation_runs?created_at=lt.${encodeURIComponent(reconciliationsBefore)}`),
      deleteRows(`customer_email_log?created_at=lt.${encodeURIComponent(metadataBefore)}`),
      deleteRows(`admin_email_log?created_at=lt.${encodeURIComponent(metadataBefore)}`),
      deleteRows(`sms_delivery_log?created_at=lt.${encodeURIComponent(metadataBefore)}`),
      deleteRows(`account_deletion_requests?status=in.(completed,cancelled)&created_at=lt.${encodeURIComponent(deletionHistoryBefore)}`)
    ]);
    const total = eventsDeleted + checksDeleted + reconciliationsDeleted + customerEmailsDeleted + adminEmailsDeleted + smsLogsDeleted + deletionRequestsDeleted;
    const summary = { eventsDeleted, checksDeleted, reconciliationsDeleted, customerEmailsDeleted, adminEmailsDeleted, smsLogsDeleted, deletionRequestsDeleted };
    await finishScheduledCheck(run, { status: 'success', itemsChecked: total, issuesFound: 0, summary });
    return { ok: true, version: APP_VERSION, ...summary };
  } catch (error) {
    await finishScheduledCheck(run, { status: 'failed', errorCode: error?.code || 'RETENTION_CLEANUP_FAILED', errorMessage: error?.message || 'Retention cleanup failed.' });
    await recordFunctionFailure('operational-retention-cleanup', error, { triggerSource });
    throw error;
  }
}

export async function handler() {
  try {
    return { statusCode: 200, body: JSON.stringify(await runOperationalRetentionCleanup({ triggerSource: 'scheduled' })) };
  } catch {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: 'Operational retention cleanup failed.' }) };
  }
}
