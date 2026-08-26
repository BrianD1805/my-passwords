import { APP_VERSION, selectRows, updateRow } from './_db.js';
import { sendEmergencyBackupReminder } from './emergency-backup-codes.js';
import { finishScheduledCheck, recordFunctionFailure, recordOperationalEvent, resolveOperationalEventsByType, startScheduledCheck } from './_operations.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
const REMINDER_MS = 90 * 24 * 60 * 60 * 1000;

export async function runEmergencyBackupCodeReminderProcess({ triggerSource = 'scheduled' } = {}) {
  const run = await startScheduledCheck('emergency_backup_code_reminders', triggerSource);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  let batchesChecked = 0;
  let sent = 0;
  let failed = 0;
  try {
    const rows = await selectRows('emergency_backup_codes', 'select=id,tenant_id,user_id,batch_id,status,created_at,reminders_enabled,last_reminder_at&status=eq.active&reminders_enabled=eq.true&order=created_at.asc&limit=1000');
    const batches = new Map();
    for (const row of rows || []) {
      const key = `${row.tenant_id}:${row.user_id}:${row.batch_id}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(row);
    }
    for (const batchRows of batches.values()) {
      batchesChecked += 1;
      const first = batchRows[0];
      const anchor = first.last_reminder_at || first.created_at;
      const anchorMs = Date.parse(anchor || '');
      if (!Number.isFinite(anchorMs) || nowMs - anchorMs < REMINDER_MS) continue;
      const delivery = await sendEmergencyBackupReminder({ tenantId: first.tenant_id, userId: first.user_id, activeCount: batchRows.length, generatedAt: first.created_at });
      if (!delivery.sent) {
        failed += 1;
        await recordOperationalEvent({ source: 'emergency_backup_code_reminder_process', eventType: 'backup_code_reminder_delivery_failed', severity: 'warning', errorCode: 'BACKUP_CODE_REMINDER_EMAIL_FAILED', message: 'An Emergency Backup Code reminder email could not be delivered.', tenantId: first.tenant_id, userId: first.user_id, metadata: { batchId: first.batch_id } });
        continue;
      }
      await updateRow('emergency_backup_codes', `tenant_id=${eq(first.tenant_id)}&user_id=${eq(first.user_id)}&batch_id=${eq(first.batch_id)}&status=${eq('active')}`, { last_reminder_at: now, updated_at: now });
      sent += 1;
    }
    if (!failed) await resolveOperationalEventsByType('emergency_backup_code_reminder_process', 'backup_code_reminder_delivery_failed');
    await finishScheduledCheck(run, { status: failed ? 'warning' : 'success', itemsChecked: batchesChecked, issuesFound: failed, summary: { remindersSent: sent, deliveryFailures: failed } });
    return { ok: true, version: APP_VERSION, checkedAt: now, batchesChecked, remindersSent: sent, deliveryFailures: failed };
  } catch (error) {
    if (/relation .*emergency_backup_codes.* does not exist/i.test(String(error?.message || ''))) {
      await finishScheduledCheck(run, { status: 'warning', errorCode: 'BACKUP_CODES_TABLE_REQUIRED', errorMessage: 'Emergency Backup Code storage has not been installed yet.' }).catch(() => null);
      return { ok: false, version: APP_VERSION, code: 'BACKUP_CODES_TABLE_REQUIRED', message: 'Emergency Backup Code storage has not been installed yet.' };
    }
    await finishScheduledCheck(run, { status: 'failed', errorCode: error?.code || 'BACKUP_CODE_REMINDER_PROCESS_FAILED', errorMessage: error?.message || 'Emergency Backup Code reminder process failed.' }).catch(() => null);
    await recordFunctionFailure('emergency-backup-code-reminder-process', error, { triggerSource }).catch(() => null);
    throw error;
  }
}

export async function handler() {
  try {
    return { statusCode: 200, body: JSON.stringify(await runEmergencyBackupCodeReminderProcess({ triggerSource: 'scheduled' })) };
  } catch {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: 'Emergency Backup Code reminder process failed.' }) };
  }
}
