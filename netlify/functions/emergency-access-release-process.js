import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';
import { finishScheduledCheck, recordFunctionFailure, recordOperationalEvent, startScheduledCheck } from './_operations.js';
import { recordEmergencyFlowEvent } from './_emergency-flow.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function lte(value) { return `lte.${encodeURIComponent(value)}`; }

const EMERGENCY_PACKAGE_ACCESS_MS = 30 * 24 * 60 * 60 * 1000;

function firstName(value) {
  return String(value || 'the account owner').trim().split(/\s+/)[0] || 'the account owner';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function withEmergencyStep(url, step) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('step', step);
    return parsed.toString();
  } catch {
    const join = String(url).includes('?') ? '&' : '?';
    return `${url}${join}step=${encodeURIComponent(step)}`;
  }
}

function formatExpiry(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toUTCString() : '30 days from release';
}

function buildReleaseReadyEmail({ contactName, ownerName, accessScope, requestUrl, releaseExpiresAt }) {
  const safeContact = escapeHtml(contactName || 'there');
  const safeOwner = escapeHtml(ownerName || 'the account owner');
  const ownerFirst = escapeHtml(firstName(ownerName));
  const safeScope = escapeHtml(accessScope || 'Emergency Info folder only');
  const safeUrl = escapeHtml(requestUrl || '');
  const expiryText = formatExpiry(releaseExpiresAt);
  const safeExpiry = escapeHtml(expiryText);
  const text = `Your Password-Encrypt Emergency Access package is ready. Hello ${contactName || 'there'}, the waiting period for your Password-Encrypt Emergency Access request for ${ownerName || 'the account owner'} has ended. The waiting period completed without cancellation, so you can now use this secure link to open only the emergency package prepared for you: ${requestUrl}. This secure link remains available for 30 days, until ${expiryText}. Open the package promptly. If you download a copy, remember that the downloaded file contains sensitive readable information and should be stored somewhere safe and private. After the 30-day access period expires, this secure link will no longer open the Emergency Package. Do not forward the link or downloaded copies to anyone else. Support: info@zippyweb.uk.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">Your emergency package is ready</h1><p style="margin:0 0 18px;line-height:1.6;color:#536579">Hello ${safeContact}, the waiting period for your Password-Encrypt Emergency Access request for <strong>${safeOwner}</strong> has ended.</p><p style="margin:0 0 18px;line-height:1.6;color:#536579">The waiting period completed without cancellation, so you can now use the secure link below to open <strong>only the emergency package prepared for you</strong>.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><p style="margin:0 0 8px"><strong>Access scope:</strong> ${safeScope}</p><p style="margin:0"><strong>Secure link available until:</strong> ${safeExpiry}</p></div>${safeUrl ? `<a href="${safeUrl}" style="display:inline-block;background:#173a5d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">Open Emergency Package</a>` : ''}<h2 style="margin:22px 0 8px;color:#14263b;font-size:18px">Important — this link is available for 30 days</h2><p style="margin:0 0 14px;line-height:1.6;color:#536579">Open the package promptly. If you need to retain the information, use the available download option and store the downloaded file somewhere safe and private.</p><p style="margin:0 0 14px;line-height:1.6;color:#536579">After the 30-day access period expires, this secure link will no longer open the Emergency Package.</p><p style="margin:0;font-size:13px;line-height:1.5;color:#7b8fa3">The Emergency Package may contain sensitive private information. Please keep the link and any downloaded copies secure and do not forward them to anyone else. If you need help, contact info@zippyweb.uk.</p><p style="margin:18px 0 0;color:#536579"><strong>Password-Encrypt</strong><br><em>A trusted place for your private details that matter.</em></p></div></div></body></html>`;
  return { subject: 'Password-Encrypt Emergency Access — Your emergency package is ready', html, text };
}

async function sendReleaseReadyEmail(invitation, request) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  const metadata = invitation?.metadata || {};
  const to = String(invitation?.contact_email || request?.contact_email || '').trim();
  if (metadata.release_ready_email_sent || request?.metadata?.release_ready_email_sent) return { sent: false, skipped: true, reason: 'already_sent' };
  if (!apiKey || !from || !to.includes('@')) return { sent: false, reason: 'Release-ready email delivery is not configured.' };
  const requestUrl = metadata.open_access_url || withEmergencyStep(invitation?.invite_url || metadata.request_access_url || '', 'open');
  const content = buildReleaseReadyEmail({
    contactName: invitation?.contact_name || request?.contact_name,
    ownerName: metadata.owner_name || 'the account owner',
    accessScope: invitation?.access_scope || request?.access_scope,
    requestUrl,
    releaseExpiresAt: request?.metadata?.release_expires_at || ''
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'Idempotency-Key': `emergency-release-ready/${request.id}`.slice(0, 256)
      },
      signal: controller.signal,
      body: JSON.stringify({ from, to, subject: content.subject, html: content.html, text: content.text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, reason: data?.message || `Email provider returned HTTP ${response.status}.` };
    return { sent: true, providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, reason: error.name === 'AbortError' ? 'Release-ready email timed out.' : (error.message || 'Release-ready email failed.') };
  } finally {
    clearTimeout(timeout);
  }
}

async function processRequest(request) {
  if (!request?.id || !request?.invitation_id || request.cancelled_at || request.released_at) return { requestId: request?.id || '', status: 'skipped' };
  const invitations = await selectRows('emergency_access_invitations', `select=*&id=${eq(request.invitation_id)}&limit=1`);
  const invitation = invitations?.[0];
  if (!invitation?.id || String(invitation.status || '').toLowerCase() === 'cancelled') return { requestId: request.id, status: 'skipped', reason: 'Invitation is unavailable.' };

  const now = new Date().toISOString();
  let current = request;
  if (String(current.status || '').toLowerCase() !== 'release_ready') {
    const nextMetadata = {
      ...(current.metadata || {}),
      version: APP_VERSION,
      release_foundation_ready: true,
      release_ready_at: now,
      release_expires_at: new Date(Date.now() + EMERGENCY_PACKAGE_ACCESS_MS).toISOString(),
      release_note: 'Waiting period ended. The owner-prepared emergency package is ready if it has been saved.'
    };
    const markedReady = await updateRow('emergency_access_requests', `id=${eq(current.id)}&status=in.(requested,waiting,owner_notified)`, {
      status: 'release_ready', metadata: nextMetadata, updated_at: now
    });
    if (markedReady?.id) current = markedReady;
    else {
      const rows = await selectRows('emergency_access_requests', `select=*&id=${eq(current.id)}&limit=1`);
      current = rows?.[0] || current;
      if (String(current.status || '').toLowerCase() !== 'release_ready') return { requestId: current.id, status: 'skipped', reason: 'Request state changed before release processing.' };
    }
  }

  let currentMetadata = current.metadata || {};
  if (!currentMetadata.release_expires_at) {
    const readyAtMs = new Date(currentMetadata.release_ready_at || now).getTime();
    const releaseExpiresAt = new Date((Number.isFinite(readyAtMs) ? readyAtMs : Date.now()) + EMERGENCY_PACKAGE_ACCESS_MS).toISOString();
    currentMetadata = { ...currentMetadata, release_expires_at: releaseExpiresAt, version: APP_VERSION };
    await updateRow('emergency_access_requests', `id=${eq(current.id)}`, { metadata: currentMetadata, updated_at: now }).catch(() => null);
    current = { ...current, metadata: currentMetadata };
  }
  if (currentMetadata.release_ready_email_sent || invitation.metadata?.release_ready_email_sent) {
    await recordEmergencyFlowEvent(invitation.id, { type: 'release_ready', title: 'Emergency package ready', message: 'The waiting period completed without cancellation. The prepared emergency package is now available to the trusted person.', occurredAt: currentMetadata.release_ready_at || now, metadata: { requestId: current.id } }).catch(() => null);
    return { requestId: current.id, status: 'release_ready', email: 'already_sent' };
  }
  const lastAttempt = currentMetadata.release_ready_email_last_attempt_at ? new Date(currentMetadata.release_ready_email_last_attempt_at).getTime() : 0;
  if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < 4 * 60 * 1000) return { requestId: current.id, status: 'release_ready', email: 'retry_wait' };

  const attemptMetadata = {
    ...currentMetadata,
    release_ready_email_last_attempt_at: now,
    release_ready_email_attempts: Number(currentMetadata.release_ready_email_attempts || 0) + 1,
    version: APP_VERSION
  };
  await updateRow('emergency_access_requests', `id=${eq(current.id)}`, { metadata: attemptMetadata, updated_at: now });
  const delivery = await sendReleaseReadyEmail(invitation, { ...current, metadata: attemptMetadata });
  const finishedAt = new Date().toISOString();
  const finalMetadata = {
    ...attemptMetadata,
    release_ready_email_sent: Boolean(delivery.sent) || Boolean(currentMetadata.release_ready_email_sent),
    release_ready_email_pending: !delivery.sent && !currentMetadata.release_ready_email_sent,
    release_ready_email_sent_at: delivery.sent ? finishedAt : (currentMetadata.release_ready_email_sent_at || null),
    release_ready_email_provider_id: delivery.providerId || currentMetadata.release_ready_email_provider_id || '',
    release_ready_email_reason: delivery.sent ? '' : (delivery.reason || currentMetadata.release_ready_email_reason || ''),
    version: APP_VERSION
  };
  await updateRow('emergency_access_requests', `id=${eq(current.id)}`, { status: 'release_ready', metadata: finalMetadata, updated_at: finishedAt }).catch(() => null);
  if (delivery.sent) {
    const freshRows = await selectRows('emergency_access_invitations', `select=metadata&id=${eq(invitation.id)}&limit=1`).catch(() => []);
    const freshMetadata = freshRows?.[0]?.metadata || invitation.metadata || {};
    await updateRow('emergency_access_invitations', `id=${eq(invitation.id)}`, {
      metadata: { ...freshMetadata, release_ready_email_sent: true, release_ready_email_sent_at: finishedAt, release_ready_email_provider_id: delivery.providerId || '', version: APP_VERSION },
      updated_at: finishedAt
    }).catch(() => null);
  }
  await recordEmergencyFlowEvent(invitation.id, { type: 'release_ready', title: 'Emergency package ready', message: 'The waiting period completed without cancellation. The prepared emergency package is now available to the trusted person.', occurredAt: currentMetadata.release_ready_at || now, metadata: { requestId: current.id } }).catch(() => null);
  if (delivery.sent) await recordEmergencyFlowEvent(invitation.id, { type: 'release_ready_email_sent', title: 'Final access email sent', message: 'The trusted person was emailed that the emergency package is ready.', occurredAt: finishedAt, metadata: { requestId: current.id } }).catch(() => null);
  return { requestId: current.id, status: 'release_ready', email: delivery.sent ? 'sent' : 'failed', reason: delivery.reason || '' };
}

async function startProcessorRun(processorType, triggerSource) {
  return insertRow('email_processor_runs', {
    id: publicId('email_processor_run'), processor_type: processorType, trigger_source: triggerSource,
    status: 'running', started_at: new Date().toISOString(), result_summary: {}, created_at: new Date().toISOString()
  }).catch(() => null);
}

async function finishProcessorRun(run, values) {
  if (!run?.id) return null;
  return updateRow('email_processor_runs', `id=${eq(run.id)}`, { ...values, finished_at: new Date().toISOString() }).catch(() => null);
}

export async function runEmergencyAccessReleaseProcessor({ triggerSource = 'scheduled' } = {}) {
  const checkedAt = new Date().toISOString();
  const run = await startProcessorRun('emergency_access_release', triggerSource);
  const checkRun = await startScheduledCheck('emergency_access_release', triggerSource);
  try {
    const due = await selectRows('emergency_access_requests', `select=*&status=in.(requested,waiting,owner_notified,release_ready)&waiting_ends_at=${lte(checkedAt)}&order=waiting_ends_at.asc&limit=100`);
    const results = [];
    for (const request of due || []) results.push(await processRequest(request));
    const sent = results.filter((row) => row.email === 'sent').length;
    const failedRows = results.filter((row) => row.email === 'failed');
    const failed = failedRows.length;
    const payload = { ok: true, version: APP_VERSION, checkedAt, triggerSource, due: due.length, processed: results.length, sent, failed, results };
    await finishProcessorRun(run, { status: failed ? 'warning' : 'success', items_checked: due.length, email_actions: results.length, result_summary: { sent, failed } });
    await finishScheduledCheck(checkRun, { status: failed ? 'warning' : 'success', itemsChecked: due.length, issuesFound: failed, summary: { due: due.length, processed: results.length, sent, failed } });
    for (const failedRow of failedRows) {
      const request = (due || []).find((candidate) => candidate.id === failedRow.requestId);
      await recordOperationalEvent({
        source: 'resend', eventType: 'resend_delivery_failure', severity: 'error', errorCode: 'EMERGENCY_RELEASE_EMAIL_FAILED',
        message: 'Emergency Access release-ready email delivery failed.',
        tenantId: request?.tenant_id || null, userId: request?.user_id || null,
        metadata: { emailType: 'emergency_access_release_ready', processor: 'emergency_access_release', triggerSource }
      });
    }
    console.log(JSON.stringify(payload));
    return payload;
  } catch (error) {
    await finishProcessorRun(run, { status: 'failed', error_message: String(error.message || 'Emergency Access release processor failed.').slice(0, 1000) });
    await finishScheduledCheck(checkRun, { status: 'failed', errorCode: error?.code || error?.name || 'EMERGENCY_ACCESS_CHECK_FAILED', errorMessage: error?.message || 'Emergency Access release processor failed.' });
    await recordFunctionFailure('emergency-access-release-process', error, { triggerSource });
    throw error;
  }
}

export async function handler() {
  try {
    const result = await runEmergencyAccessReleaseProcessor({ triggerSource: 'scheduled' });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: error.message || 'Emergency Access release processor failed.' }) };
  }
}
