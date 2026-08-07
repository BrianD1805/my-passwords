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

function unixSecondsToIso(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const time = seconds * 1000;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}


async function fetchJson(url, accessToken) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function supabaseOrganizationPlan(ref, accessToken) {
  // Plan detection is deliberately best-effort. A normal Supabase Personal Access Token
  // can read the project and organization. Fine-grained backup-only tokens may not have
  // those extra read permissions, in which case backup verification falls back safely to
  // the backup endpoint response rather than failing the health check just because plan
  // metadata could not be read.
  try {
    const projectResult = await fetchJson(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}`, accessToken);
    if (!projectResult.response.ok) return null;
    const organizationSlug = String(projectResult.data?.organization_slug || '').trim();
    if (!organizationSlug) return null;
    const organizationResult = await fetchJson(`https://api.supabase.com/v1/organizations/${encodeURIComponent(organizationSlug)}`, accessToken);
    if (!organizationResult.response.ok) return null;
    const plan = String(organizationResult.data?.plan || '').trim().toLowerCase();
    return plan || null;
  } catch {
    return null;
  }
}

export function summariseSupabaseBackupResponse(data, checkedAt = new Date().toISOString(), organizationPlan = null) {
  const backups = Array.isArray(data?.backups) ? data.backups : [];
  const completed = backups.filter((row) => String(row?.status || '').toUpperCase() === 'COMPLETED');
  const logicalLatestAt = completed.map(backupDate).filter(Boolean).sort().reverse()[0] || null;
  const physicalLatestAt = unixSecondsToIso(data?.physical_backup_data?.latest_physical_backup_date_unix);
  const latestBackupAt = [logicalLatestAt, physicalLatestAt].filter(Boolean).sort().reverse()[0] || null;
  const pitrEnabled = Boolean(data?.pitr_enabled);
  const walgEnabled = Boolean(data?.walg_enabled);

  // Supabase automatic backups are not included on the Free organization plan. Prefer
  // the Management API's organization plan when it is available, because Free projects can
  // still return backup metadata rows even though no managed completed backup is available.
  // The older empty-response heuristic remains as a safe fallback for backup-only tokens that
  // cannot read project/organization metadata.
  const freePlan = String(organizationPlan || '').toLowerCase() === 'free';
  const managedBackupUnavailable = freePlan || (!latestBackupAt && backups.length === 0 && !pitrEnabled && !walgEnabled);
  if (managedBackupUnavailable) {
    return {
      ok: true,
      status: 'not_available',
      checkedAt,
      dataPlaneReachable: true,
      managementApiConfigured: true,
      latestBackupAt: null,
      backupCount: backups.length,
      pitrEnabled,
      walgEnabled,
      physicalBackupDataAvailable: Boolean(physicalLatestAt),
      organizationPlan: organizationPlan || null,
      message: freePlan
        ? 'Managed Supabase database backups are not available on the current Supabase Free plan. Use a separate manual/off-site backup until the project is upgraded.'
        : 'Managed Supabase database backups are not available for this project. Use a separate manual/off-site backup until managed backups are enabled.'
    };
  }

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
    pitrEnabled,
    walgEnabled,
    physicalBackupDataAvailable: Boolean(physicalLatestAt),
    message: fresh
      ? 'The latest completed Supabase database backup is within the 36-hour verification window.'
      : (latestBackupAt ? 'The latest completed Supabase backup is older than 36 hours.' : 'Supabase returned backup records, but no completed backup could be verified.')
  };
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
    const organizationPlan = await supabaseOrganizationPlan(ref, accessToken);
    const { response, data } = await fetchJson(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/backups`, accessToken);
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

    return summariseSupabaseBackupResponse(data, checkedAt, organizationPlan);
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
