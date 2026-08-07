import { selectRows } from './_db.js';
import { sanitiseOperationalText } from './_operations.js';

function projectRef() {
  const configured = String(process.env.SUPABASE_PROJECT_REF || '').trim();
  if (configured) return configured;
  try {
    const host = new URL(String(process.env.SUPABASE_URL || '')).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : '';
  } catch {
    return '';
  }
}

function backupDate(row) {
  const value = row?.inserted_at || row?.created_at || row?.completed_at || '';
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function verifyDatabaseBackup() {
  const checkedAt = new Date().toISOString();
  const ref = projectRef();
  const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || '').trim();

  try {
    await selectRows('tenants', 'select=id&limit=1');
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      checkedAt,
      dataPlaneReachable: false,
      managementApiConfigured: Boolean(ref && accessToken),
      latestBackupAt: null,
      message: 'Supabase data access failed, so database backup verification could not continue.',
      errorCode: error?.code || 'SUPABASE_DATA_UNAVAILABLE'
    };
  }

  if (!ref || !accessToken) {
    return {
      ok: true,
      status: 'not_configured',
      checkedAt,
      dataPlaneReachable: true,
      managementApiConfigured: false,
      latestBackupAt: null,
      message: 'Database is reachable. Add SUPABASE_ACCESS_TOKEN to verify the latest Supabase managed backup automatically.'
    };
  }

  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/backups`, {
      method: 'GET',
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        checkedAt,
        dataPlaneReachable: true,
        managementApiConfigured: true,
        latestBackupAt: null,
        message: `Supabase backup verification returned HTTP ${response.status}.`,
        errorCode: sanitiseOperationalText(data?.message || data?.error || `HTTP_${response.status}`, 120)
      };
    }

    const backups = Array.isArray(data?.backups) ? data.backups : [];
    const completed = backups.filter((row) => String(row?.status || '').toUpperCase() === 'COMPLETED');
    const latestBackupAt = completed.map(backupDate).filter(Boolean).sort().reverse()[0] || null;
    const latestMs = latestBackupAt ? new Date(latestBackupAt).getTime() : 0;
    const ageHours = latestMs ? (Date.now() - latestMs) / 3600000 : null;
    const fresh = ageHours != null && ageHours <= 36;
    return {
      ok: fresh,
      status: fresh ? 'success' : 'warning',
      checkedAt,
      dataPlaneReachable: true,
      managementApiConfigured: true,
      latestBackupAt,
      backupCount: backups.length,
      pitrEnabled: Boolean(data?.pitr_enabled),
      walgEnabled: Boolean(data?.walg_enabled),
      physicalBackupDataAvailable: Boolean(data?.physical_backup_data),
      message: fresh ? 'The latest completed Supabase database backup is within the 36-hour verification window.' : (latestBackupAt ? 'The latest completed Supabase backup is older than 36 hours.' : 'No completed Supabase backup was returned by the Management API.')
    };
  } catch (error) {
    return {
      ok: false,
      status: 'failed',
      checkedAt,
      dataPlaneReachable: true,
      managementApiConfigured: true,
      latestBackupAt: null,
      message: 'The Supabase backup verification request failed.',
      errorCode: error?.name || 'BACKUP_VERIFICATION_FAILED'
    };
  }
}
