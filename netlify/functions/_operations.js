import { createHash } from 'node:crypto';
import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

const SENSITIVE_KEY = /(^|_)(password|master_password|passphrase|secret|token|authorization|cookie|encrypted_blob|vault_blob|local_salt|local_iv|document_content|document_blob|raw_body|request_body|otp|one_time_code|recovery_code|recovery_key|private_key|api_key|card_number|ccv|cvv|pin)($|_)/i;

export function sanitiseOperationalText(value, max = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/g, '[provider-key-redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}\b/gi, 'Bearer [redacted]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, '[token-redacted]')
    .replace(/\b[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}\b/g, '[email-redacted]')
    .replace(/\b\d{13,19}\b/g, '[number-redacted]')
    .trim()
    .slice(0, max);
}

export function sanitiseOperationalMetadata(value, depth = 0) {
  if (depth > 3 || value == null) return value == null ? null : '[depth-limited]';
  if (typeof value === 'string') return sanitiseOperationalText(value, 500);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitiseOperationalMetadata(item, depth + 1));
  if (typeof value !== 'object') return sanitiseOperationalText(value, 200);
  const result = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, 40)) {
    const key = String(rawKey || '').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
    if (!key || SENSITIVE_KEY.test(key)) {
      if (key) result[key] = '[redacted]';
      continue;
    }
    result[key] = sanitiseOperationalMetadata(rawValue, depth + 1);
  }
  return result;
}

function retentionDate(severity, now = Date.now()) {
  const days = severity === 'critical' ? 365 : severity === 'error' ? 180 : severity === 'warning' ? 90 : 30;
  return new Date(now + days * 86400000).toISOString();
}

function eventFingerprint({ source, eventType, tenantId = '', errorCode = '', fingerprint = '' }) {
  const raw = fingerprint || `${source}|${eventType}|${tenantId}|${errorCode}`;
  return createHash('sha256').update(String(raw)).digest('hex');
}

export async function recordOperationalEvent({
  source,
  eventType,
  severity = 'info',
  status = 'open',
  errorCode = '',
  message = '',
  tenantId = null,
  userId = null,
  metadata = {},
  fingerprint = '',
  dedupe = true,
  incrementOccurrenceOnDedupe = true
}) {
  const safeSeverity = ['info', 'warning', 'error', 'critical'].includes(String(severity)) ? String(severity) : 'info';
  const safeStatus = status === 'resolved' ? 'resolved' : 'open';
  const safeSource = sanitiseOperationalText(source || 'server', 120) || 'server';
  const safeEventType = sanitiseOperationalText(eventType || 'operational_event', 120) || 'operational_event';
  const safeErrorCode = sanitiseOperationalText(errorCode, 120);
  const safeMessage = sanitiseOperationalText(message, 500);
  const safeMetadata = sanitiseOperationalMetadata({ version: APP_VERSION, ...metadata });
  const hash = eventFingerprint({ source: safeSource, eventType: safeEventType, tenantId: tenantId || '', errorCode: safeErrorCode, fingerprint });
  const now = new Date().toISOString();

  if (dedupe && safeStatus === 'open') {
    const existing = await selectRows('operational_events', `select=id,occurrence_count,metadata&fingerprint=${eq(hash)}&status=${eq('open')}&order=last_seen_at.desc&limit=1`).catch(() => []);
    if (existing?.[0]?.id) {
      return updateRow('operational_events', `id=${eq(existing[0].id)}`, {
        severity: safeSeverity,
        error_code: safeErrorCode || null,
        message: safeMessage,
        occurrence_count: incrementOccurrenceOnDedupe ? Number(existing[0].occurrence_count || 1) + 1 : Number(existing[0].occurrence_count || 1),
        metadata: sanitiseOperationalMetadata({ ...(existing[0].metadata || {}), ...safeMetadata }),
        last_seen_at: now,
        retention_until: retentionDate(safeSeverity),
        updated_at: now
      }).catch(() => null);
    }
  }

  return insertRow('operational_events', {
    id: publicId('ops'),
    tenant_id: tenantId || null,
    user_id: userId || null,
    source: safeSource,
    event_type: safeEventType,
    severity: safeSeverity,
    status: safeStatus,
    error_code: safeErrorCode || null,
    message: safeMessage,
    fingerprint: hash,
    occurrence_count: 1,
    metadata: safeMetadata,
    occurred_at: now,
    last_seen_at: now,
    resolved_at: safeStatus === 'resolved' ? now : null,
    retention_until: retentionDate(safeSeverity),
    created_at: now,
    updated_at: now
  }).catch(() => null);
}

export async function resolveOperationalEvent(eventId, resolutionNote = '') {
  const now = new Date().toISOString();
  return updateRow('operational_events', `id=${eq(eventId)}&status=${eq('open')}`, {
    status: 'resolved',
    resolved_at: now,
    resolution_note: sanitiseOperationalText(resolutionNote || 'Resolved by Owner Admin.', 500),
    updated_at: now
  });
}

export async function resolveOperationalEventsByType(source, eventType, resolutionNote = 'Recovered automatically after a healthy check.') {
  const rows = await selectRows('operational_events', `select=id&source=${eq(source)}&event_type=${eq(eventType)}&status=${eq('open')}&limit=100`).catch(() => []);
  const resolved = [];
  for (const row of rows || []) {
    const updated = await resolveOperationalEvent(row.id, resolutionNote).catch(() => null);
    if (updated?.id) resolved.push(updated);
  }
  return resolved;
}

export async function startScheduledCheck(checkType, triggerSource = 'scheduled') {
  const now = new Date().toISOString();
  return insertRow('scheduled_check_runs', {
    id: publicId('check'),
    check_type: sanitiseOperationalText(checkType, 120),
    trigger_source: triggerSource === 'admin' ? 'admin' : 'scheduled',
    status: 'running',
    started_at: now,
    result_summary: {},
    created_at: now
  }).catch(() => null);
}

export async function finishScheduledCheck(run, { status = 'success', itemsChecked = 0, issuesFound = 0, summary = {}, errorCode = '', errorMessage = '' } = {}) {
  if (!run?.id) return null;
  const safeStatus = ['success', 'warning', 'failed'].includes(status) ? status : 'success';
  return updateRow('scheduled_check_runs', `id=${eq(run.id)}`, {
    status: safeStatus,
    finished_at: new Date().toISOString(),
    items_checked: Math.max(0, Number(itemsChecked || 0)),
    issues_found: Math.max(0, Number(issuesFound || 0)),
    result_summary: sanitiseOperationalMetadata(summary),
    error_code: sanitiseOperationalText(errorCode, 120) || null,
    error_message: sanitiseOperationalText(errorMessage, 800) || null
  }).catch(() => null);
}

export function runtimeFunctionName(fallback = 'server_function') {
  const raw = process.env.NETLIFY_FUNCTION_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME || fallback;
  return sanitiseOperationalText(raw, 160) || fallback;
}

export async function recordFunctionFailure(source, error, context = {}) {
  return recordOperationalEvent({
    source: source || runtimeFunctionName(),
    eventType: 'function_failure',
    severity: 'error',
    errorCode: error?.code || error?.name || 'FUNCTION_FAILURE',
    message: error?.message || 'Server function failed.',
    tenantId: context.tenantId || null,
    userId: context.userId || null,
    metadata: {
      httpStatus: Number(error?.status || context.httpStatus || 500),
      action: context.action || '',
      triggerSource: context.triggerSource || '',
      ...context.metadata
    }
  });
}
