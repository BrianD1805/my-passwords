import { APP_VERSION } from './_db.js';
import { verifyDatabaseBackup } from './_database-backup.js';
import { finishScheduledCheck, recordFunctionFailure, recordOperationalEvent, resolveOperationalEventsByType, startScheduledCheck } from './_operations.js';

export async function runDatabaseBackupVerification({ triggerSource = 'scheduled' } = {}) {
  const run = await startScheduledCheck('database_backup_verification', triggerSource);
  try {
    const result = await verifyDatabaseBackup();
    const issue = !result.ok && result.status !== 'not_configured';
    const setupWarning = result.status === 'not_configured';
    if (issue) {
      await recordOperationalEvent({
        source: 'database_backup_verification', eventType: 'database_backup_verification_failed',
        severity: result.dataPlaneReachable ? 'error' : 'critical', errorCode: result.errorCode || 'DATABASE_BACKUP_VERIFY_FAILED',
        message: result.message, metadata: { dataPlaneReachable: result.dataPlaneReachable, managementApiConfigured: result.managementApiConfigured, latestBackupAt: result.latestBackupAt }
      });
    } else {
      await resolveOperationalEventsByType('database_backup_verification', 'database_backup_verification_failed');
    }
    await finishScheduledCheck(run, {
      status: issue ? 'failed' : (setupWarning || result.status === 'warning' ? 'warning' : 'success'),
      itemsChecked: 1,
      issuesFound: issue || setupWarning || result.status === 'warning' ? 1 : 0,
      summary: result,
      errorCode: issue ? result.errorCode : '',
      errorMessage: issue ? result.message : ''
    });
    return { version: APP_VERSION, ...result };
  } catch (error) {
    await finishScheduledCheck(run, { status: 'failed', errorCode: error?.code || 'DATABASE_BACKUP_VERIFY_FAILED', errorMessage: error?.message || 'Database backup verification failed.' });
    await recordFunctionFailure('database-backup-verify', error, { triggerSource });
    throw error;
  }
}

export async function handler() {
  try {
    const result = await runDatabaseBackupVerification({ triggerSource: 'scheduled' });
    return { statusCode: result.ok || result.status === 'not_configured' || result.status === 'warning' ? 200 : 500, body: JSON.stringify({ ok: result.ok, ...result }) };
  } catch {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: 'Database backup verification failed.' }) };
  }
}
