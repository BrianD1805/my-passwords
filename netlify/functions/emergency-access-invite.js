import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { getActiveCustomerSession } from './_session.js';
import { createHash, randomBytes } from 'node:crypto';
import { assertBrowserAction, consumeRateLimit, securityErrorResponseHeaders } from './_security.js';
import { buildEmergencyFlowEvents, recordEmergencyFlowEvent, resetEmergencyFlowToZero } from './_emergency-flow.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function inList(values) {
  return `in.(${values.map((value) => String(value)).join(',')})`;
}

function tokenHash(token) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite';
  return createHash('sha256').update(`${token}:${secret}`).digest('hex');
}

function hasWaitingPeriodEnded(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

const EMERGENCY_PACKAGE_ACCESS_MS = 30 * 24 * 60 * 60 * 1000;

function formatReleaseExpiry(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime()) ? date.toUTCString() : '30 days from release';
}

function buildReleaseReadyEmail({ contactName, ownerName, accessScope, requestUrl, releaseExpiresAt }) {
  const safeContact = escapeHtml(contactName || 'there');
  const safeOwner = escapeHtml(ownerName || 'the account owner');
  const safeScope = escapeHtml(accessScope || 'Emergency Info folder only');
  const safeUrl = escapeHtml(requestUrl || '');
  const safeExpiry = escapeHtml(formatReleaseExpiry(releaseExpiresAt));
  const text = `Your Password-Encrypt Emergency Access package is ready. Hello ${contactName || 'there'}, the waiting period for your Password-Encrypt Emergency Access request for ${ownerName || 'the account owner'} has ended. The waiting period completed without cancellation, so you can now use this secure link to open only the emergency package prepared for you: ${requestUrl}. This secure link remains available for 30 days, until ${formatReleaseExpiry(releaseExpiresAt)}. Open the package promptly. If you download a copy, store it somewhere safe and private. After the 30-day access period expires, this secure link will no longer open the Emergency Package. Do not forward the link or downloaded copies. Support: info@zippyweb.uk.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">Your emergency package is ready</h1><p style="margin:0 0 18px;line-height:1.6;color:#536579">Hello ${safeContact}, the waiting period for your Password-Encrypt Emergency Access request for <strong>${safeOwner}</strong> has ended.</p><p style="margin:0 0 18px;line-height:1.6;color:#536579">The waiting period completed without cancellation, so you can now use the secure browser link below to open <strong>only the emergency package prepared for you</strong>.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><p style="margin:0 0 8px"><strong>Access scope:</strong> ${safeScope}</p><p style="margin:0"><strong>Secure link available until:</strong> ${safeExpiry}</p></div>${safeUrl ? `<a href="${safeUrl}" style="display:inline-block;background:#173a5d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">Open Emergency Package</a>` : ''}<h2 style="margin:22px 0 8px;color:#14263b;font-size:18px">Important — this link is available for 30 days</h2><p style="margin:0 0 14px;line-height:1.6;color:#536579">Open the package promptly. If you need to retain the information, use the available download option and store the downloaded file somewhere safe and private.</p><p style="margin:0 0 14px;line-height:1.6;color:#536579">After the 30-day access period expires, this secure link will no longer open the Emergency Package.</p><p style="margin:0;font-size:13px;line-height:1.5;color:#7b8fa3">The Emergency Package may contain sensitive private information. Please keep the link and any downloaded copies secure and do not forward them to anyone else. If you need help, contact info@zippyweb.uk.</p></div></div></body></html>`;
  return { html, text, subject: 'Password-Encrypt Emergency Access — Your emergency package is ready' };
}

async function notifyEmergencyContactReleaseReady({ invitation, request }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  const metadata = invitation?.metadata || {};
  if (metadata.release_ready_email_sent || request?.metadata?.release_ready_email_sent) return { sent: false, skipped: true, reason: 'Release-ready email was already sent.' };
  const to = invitation?.contact_email || request?.contact_email || '';
  if (!apiKey || !from || !to || !to.includes('@')) return { sent: false, provider: 'resend', reason: 'Release-ready email is not configured.' };
  const requestUrl = metadata.open_access_url || withEmergencyStep(invitation?.invite_url || metadata.request_access_url || '', 'open');
  const content = buildReleaseReadyEmail({ contactName: invitation?.contact_name || request?.contact_name, ownerName: metadata.owner_name || 'the account owner', accessScope: invitation?.access_scope || request?.access_scope, requestUrl, releaseExpiresAt: request?.metadata?.release_expires_at || '' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ from, to, subject: content.subject || 'Password-Encrypt access is ready', html: content.html, text: content.text }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
    return { sent: true, provider: 'resend', providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, provider: 'resend', reason: error.name === 'AbortError' ? 'Release-ready email timed out.' : (error.message || 'Release-ready email could not be sent.') };
  } finally {
    clearTimeout(timeout);
  }
}

async function markReleaseReadyIfDue(request, invitation = null) {
  const status = String(request?.status || '').toLowerCase();
  if (!request?.id || !['requested', 'waiting', 'owner_notified'].includes(status) || request.cancelled_at || request.released_at || !hasWaitingPeriodEnded(request.waiting_ends_at)) {
    return request;
  }
  const now = new Date().toISOString();
  const releaseExpiresAt = request?.metadata?.release_expires_at || new Date(Date.now() + EMERGENCY_PACKAGE_ACCESS_MS).toISOString();
  const requestWithWindow = { ...request, metadata: { ...(request.metadata || {}), release_ready_at: request?.metadata?.release_ready_at || now, release_expires_at: releaseExpiresAt, version: APP_VERSION } };
  const releaseEmail = invitation ? await notifyEmergencyContactReleaseReady({ invitation, request: requestWithWindow }).catch((error) => ({ sent: false, reason: error.message || 'Release-ready email failed.' })) : null;
  const nextMetadata = {
    ...(requestWithWindow.metadata || {}),
    version: APP_VERSION,
    release_foundation_ready: true,
    release_ready_at: requestWithWindow.metadata.release_ready_at,
    release_expires_at: releaseExpiresAt,
    release_note: 'Waiting period ended. The selected owner-prepared emergency package can now be released from the secure invite link.',
    release_ready_email_sent: Boolean(releaseEmail?.sent) || Boolean(request.metadata?.release_ready_email_sent),
    release_ready_email_provider_id: releaseEmail?.providerId || request.metadata?.release_ready_email_provider_id || '',
    release_ready_email_reason: releaseEmail && !releaseEmail.sent && !releaseEmail.skipped ? (releaseEmail.reason || '') : (request.metadata?.release_ready_email_reason || '')
  };
  const updated = await updateRow('emergency_access_requests', `id=${eq(request.id)}`, {
    status: 'release_ready',
    metadata: nextMetadata,
    updated_at: now
  }).catch(() => null);
  if (invitation?.id && releaseEmail?.sent) {
    await updateRow('emergency_access_invitations', `id=${eq(invitation.id)}`, {
      updated_at: now,
      metadata: { ...(invitation.metadata || {}), release_ready_email_sent: true, release_ready_email_sent_at: now, release_ready_email_provider_id: releaseEmail.providerId || '', version: APP_VERSION }
    }).catch(() => null);
  }
  if (invitation?.id) await recordEmergencyFlowEvent(invitation.id, { type: 'release_ready', title: 'Emergency package ready', message: 'The waiting period completed without cancellation. The prepared emergency package is now available.', occurredAt: now, metadata: { requestId: request.id } }).catch(() => null);
  return updated || { ...request, status: 'release_ready', metadata: nextMetadata };
}

function appBaseUrl(event) {
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
  if (envUrl) return envUrl.replace(/\/$/, '');
  const host = event.headers?.host || 'password-encrypt.com';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

function firstName(name) {
  return String(name || 'the account owner').trim().split(/\s+/)[0] || 'the account owner';
}

function emergencyStepUrl(base, token, step) {
  return `${base}/emergency-invite?step=${encodeURIComponent(step)}&token=${encodeURIComponent(token)}`;
}

function withEmergencyStep(url, step) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('step', step);
    return parsed.toString();
  } catch {
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}step=${encodeURIComponent(step)}`;
  }
}

function publicLandingUrlFromLink(url) {
  try { return `${new URL(url).origin}/`; }
  catch { return 'https://password-encrypt.com/'; }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildInviteEmail({ ownerName, ownerEmail, ownerPhone, contactName, waitingPeriod, accessScope, acceptUrl }) {
  const safeOwnerText = ownerName || 'A Password-Encrypt user';
  const safeContactText = contactName || 'there';
  const safeWaitingText = waitingPeriod || '7 days';
  const safeScopeText = accessScope || 'Emergency Info folder only';
  const landingUrl = publicLandingUrlFromLink(acceptUrl);
  const safeOwner = escapeHtml(safeOwnerText);
  const safeOwnerEmail = escapeHtml(ownerEmail || 'Not supplied');
  const safeOwnerPhone = escapeHtml(ownerPhone || 'Not supplied');
  const safeContact = escapeHtml(safeContactText);
  const safeWaiting = escapeHtml(safeWaitingText);
  const safeScope = escapeHtml(safeScopeText);
  const safeAcceptUrl = escapeHtml(acceptUrl || '');
  const safeLandingUrl = escapeHtml(landingUrl);
  const text = `You've been chosen as a trusted person. ${safeOwnerText} has chosen you as their trusted person for their Password-Encrypt account. Password-Encrypt is a secure encrypted vault used to store important private information such as passwords, account details, secure notes and other information the account holder may want protected. The Trusted Person feature is designed for situations such as serious illness, incapacity, or when the account holder is no longer able to access or manage their vault themselves. The person who selected you: Name: ${safeOwnerText}. Email: ${ownerEmail || 'Not supplied'}. Phone: ${ownerPhone || 'Not supplied'}. Being selected does not give you access to their Password-Encrypt vault now. First, you need to accept their invitation: ${acceptUrl}. If you ever need emergency access in the future, you will make a separate access request. Password-Encrypt then starts the account holder's configured ${safeWaitingText} waiting period and notifies them of the request. During that waiting period, the account holder can cancel the request. Only if the waiting period completes without cancellation can the prepared ${safeScopeText} emergency information become available. Nothing from their vault is available to you simply by accepting this invitation. If you were not expecting this invitation, you do not need to take any action. Learn more about Password-Encrypt: ${landingUrl}. Password-Encrypt support will never ask you for the account holder's master password, passwords, recovery codes or other private vault contents.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">You've been chosen as a trusted person</h1><p style="margin:0 0 16px;line-height:1.6;color:#536579"><strong>${safeOwner}</strong> has chosen you as their trusted person for their Password-Encrypt account.</p><p style="margin:0 0 16px;line-height:1.6;color:#536579"><strong>Password-Encrypt</strong> is a secure encrypted vault used to store important private information such as passwords, account details, secure notes and other information the account holder may want protected.</p><p style="margin:0 0 16px;line-height:1.6;color:#536579">The Trusted Person feature is designed for situations such as serious illness, incapacity, or when the account holder is no longer able to access or manage their vault themselves.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><p style="margin:0 0 10px"><strong>The person who selected you</strong></p><p style="margin:0 0 6px"><strong>Name:</strong> ${safeOwner}</p><p style="margin:0 0 6px"><strong>Email:</strong> ${safeOwnerEmail}</p><p style="margin:0"><strong>Phone:</strong> ${safeOwnerPhone}</p></div><h2 style="margin:0 0 10px;color:#14263b;font-size:18px">What does being a trusted person mean?</h2><p style="margin:0 0 16px;line-height:1.6;color:#536579">Being selected does <strong>not</strong> give you access to their Password-Encrypt vault now. First, you need to accept their invitation. If you ever need emergency access in the future, you will make a separate access request. Password-Encrypt then starts the account holder's configured <strong>${safeWaiting}</strong> waiting period and notifies them of the request.</p><p style="margin:0 0 18px;line-height:1.6;color:#536579">During that waiting period, the account holder can cancel the request. Only if the waiting period completes without cancellation can the prepared <strong>${safeScope}</strong> emergency information become available.</p><p style="margin:0 0 18px;line-height:1.6;color:#14263b"><strong>Nothing from their vault is available to you simply by accepting this invitation.</strong></p>${safeAcceptUrl ? `<a href="${safeAcceptUrl}" style="display:inline-block;background:#173a5d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">Accept trusted person invitation</a>` : ''}<p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#7b8fa3">If you were not expecting this invitation, you do not need to take any action.</p><div style="border-top:1px solid #e0e8ef;margin-top:22px;padding-top:18px"><p style="margin:0 0 8px;line-height:1.55;color:#536579"><strong>Want to know more about Password-Encrypt?</strong><br>Learn how Password-Encrypt protects passwords and private details, including Trusted Person Access.</p><a href="${safeLandingUrl}" style="color:#336699;font-weight:700;text-decoration:none">Learn more about Password-Encrypt</a></div><p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#7b8fa3">For your security, Password-Encrypt support will never ask you for the account holder's master password, passwords, recovery codes or other private vault contents.</p></div></div></body></html>`;
  return { html, text, subject: `You've been chosen as a trusted person for Password-Encrypt` };
}

function buildRequestLinkEmail({ ownerName, contactName, waitingPeriod, accessScope, requestUrl }) {
  const safeOwnerText = ownerName || 'the account owner';
  const ownerFirstText = firstName(safeOwnerText);
  const safeContactText = contactName || 'there';
  const safeWaitingText = waitingPeriod || '7 days';
  const safeScopeText = accessScope || 'Emergency Info folder only';
  const safeOwner = escapeHtml(safeOwnerText);
  const ownerFirst = escapeHtml(ownerFirstText);
  const safeContact = escapeHtml(safeContactText);
  const safeWaiting = escapeHtml(safeWaitingText);
  const safeScope = escapeHtml(safeScopeText);
  const safeRequestUrl = escapeHtml(requestUrl || '');
  const text = `Hello ${safeContactText}. You have accepted the trusted person invitation for ${safeOwnerText}. Keep this Password-Encrypt Emergency Access email and its secure Request Emergency Access link somewhere safe and private for future use: ${requestUrl}. You may not need it for a long time. Nothing from the vault is available now. If emergency access is ever genuinely required, use this link to begin the request. Using it starts the ${safeWaitingText} waiting period and immediately notifies ${safeOwnerText}. ${safeOwnerText} can cancel during that period. Only if the waiting period ends without cancellation will the prepared ${safeScopeText} emergency package become available. Using the link does not immediately reveal any vault information.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">Keep your Emergency Access link safe</h1><p style="margin:0 0 16px;line-height:1.6;color:#536579">Hello ${safeContact}, you have accepted the trusted person invitation for ${safeOwner}.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><strong>Keep this email somewhere safe</strong><p style="margin:8px 0 0;line-height:1.55;color:#536579">Save this email or store the secure link somewhere safe and private. You may not need it for a long time, but this is the link you will use if Emergency Access is genuinely required in the future.</p></div><p style="margin:0 0 16px;line-height:1.6;color:#536579"><strong>Nothing from the vault is available now.</strong> Using the link below does not immediately reveal any vault information.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><p style="margin:0 0 8px"><strong>Waiting period:</strong> ${safeWaiting}</p><p style="margin:0"><strong>Prepared access scope:</strong> ${safeScope}</p></div>${safeRequestUrl ? `<a href="${safeRequestUrl}" style="display:inline-block;background:#173a5d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">Request Emergency Access for ${ownerFirst}</a>` : ''}<p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#7b8fa3">Using this link starts the waiting period and notifies ${safeOwner}. ${safeOwner} can cancel before the period ends. Only if it completes without cancellation will the prepared package become available.</p></div></div></body></html>`;
  return { html, text, subject: 'Password-Encrypt Emergency Access — Keep this link safe' };
}

async function sendRequestLinkWithResend({ to, ownerName, contactName, waitingPeriod, accessScope, requestUrl }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from || !to || !to.includes('@') || !requestUrl) {
    return { sent: false, provider: 'resend', reason: 'Request link email is not configured or the request link is missing.' };
  }
  const content = buildRequestLinkEmail({ ownerName, contactName, waitingPeriod, accessScope, requestUrl });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to,
        subject: content.subject || 'Password-Encrypt Emergency Access — Keep this link safe',
        html: content.html,
        text: content.text
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
    return { sent: true, provider: 'resend', providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, provider: 'resend', reason: error.name === 'AbortError' ? 'Request link email timed out.' : (error.message || 'Request link email could not be sent.') };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendWithResend({ to, ownerName, ownerEmail, ownerPhone, contactName, waitingPeriod, accessScope, acceptUrl }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) {
    return { sent: false, provider: 'resend', reason: 'Email sending is not configured yet. The invite link was still created and can be copied manually.' };
  }
  const content = buildInviteEmail({ ownerName, ownerEmail, ownerPhone, contactName, waitingPeriod, accessScope, acceptUrl });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to,
        subject: content.subject || 'Password-Encrypt trusted person nomination',
        html: content.html,
        text: content.text
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
    return { sent: true, provider: 'resend', providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, provider: 'resend', reason: error.name === 'AbortError' ? 'Resend timed out. The invite link was still created and can be copied manually.' : (error.message || 'Resend could not send the invitation email.') };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const body = parseBody(event);
  const action = String(body.action || 'send').trim();
  let session;
  try { session = await getActiveCustomerSession(event); }
  catch (error) { return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not check device verification.', error: error.message }); }
  if (!session) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'SESSION_REQUIRED', message: 'Verify your account before managing Emergency Access.' });
  if (session.entitlements?.features?.emergencyAccess === false) {
    return jsonResponse(403, {
      ok: false,
      version: APP_VERSION,
      code: 'PLAN_FEATURE_REQUIRED',
      feature: 'emergencyAccess',
      upgradeRequired: true,
      entitlements: session.entitlements,
      message: 'Emergency Access is not included in this plan.'
    });
  }
  const sessionTenantId = session.tenantId;
  const sessionUserId = session.userId;

  try {
    assertBrowserAction(event, { session, kind: 'customer', csrf: true });
    await consumeRateLimit(event, { scope: 'emergency_owner_action', identifier: session.sessionId || sessionUserId, limit: 40, windowSeconds: 15 * 60, blockSeconds: 15 * 60 });
    if (action === 'save_package') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = sessionTenantId;
      const userId = sessionUserId;
      const packageEnvelope = body.packageEnvelope || null;
      const packageSummary = body.packageSummary || {};
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      if (!packageEnvelope?.encrypted || !packageEnvelope?.salt || !packageEnvelope?.iv) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Emergency package data is incomplete.' });
      const rows = await selectRows('emergency_access_invitations', `select=id,status,access_scope,metadata&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&id=${eq(invitationId)}&limit=1`);
      const invitation = rows?.[0];
      if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Invitation was not found.' });
      if (invitation.status === 'cancelled') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This invitation has been cancelled. Reset it and send a fresh invitation first.' });
      const requestRows = await selectRows('emergency_access_requests', `select=id,status,released_at,updated_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&invitation_id=${eq(invitationId)}&order=created_at.desc&limit=1`).catch(() => []);
      const latestRequest = requestRows?.[0] || null;
      const requestStatus = String(latestRequest?.status || '').toLowerCase();
      if (latestRequest?.released_at || ['release_ready', 'released'].includes(requestStatus)) {
        return jsonResponse(409, {
          ok: false,
          version: APP_VERSION,
          code: 'EMERGENCY_PACKAGE_FROZEN',
          packageSummary: invitation.metadata?.emergency_package_summary || null,
          message: 'The Emergency Package has already been released and is frozen as the release snapshot. Later vault changes will not alter it.'
        });
      }
      const now = new Date().toISOString();
      const sourceFingerprint = String(body.sourceFingerprint || '').trim().slice(0, 128);
      const refreshReason = String(body.refreshReason || 'manual_package_save').trim().slice(0, 80);
      const existingFingerprint = String(invitation.metadata?.emergency_package_source_fingerprint || '');
      if (sourceFingerprint && existingFingerprint === sourceFingerprint && invitation.metadata?.emergency_package_envelope?.encrypted) {
        return jsonResponse(200, {
          ok: true,
          unchanged: true,
          version: APP_VERSION,
          invitationId,
          packageSavedAt: invitation.metadata?.emergency_package_saved_at || invitation.metadata?.emergency_package_summary?.preparedAt || now,
          packageSummary: invitation.metadata?.emergency_package_summary || null,
          events: buildEmergencyFlowEvents(invitation, requestRows || []),
          message: 'The prepared Emergency Package is already current.'
        });
      }
      const cleanSummary = {
        releaseScope: packageSummary.releaseScope || invitation.access_scope || 'Emergency Info folder only',
        fullVaultAccess: Boolean(packageSummary.fullVaultAccess),
        itemCount: Number(packageSummary.itemCount || 0),
        documentCount: Number(packageSummary.documentCount || 0),
        preparedAt: packageSummary.preparedAt || now,
        title: packageSummary.title || 'Emergency vault package',
        version: APP_VERSION
      };
      await updateRow('emergency_access_invitations', `id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, {
        access_scope: cleanSummary.releaseScope,
        metadata: {
          ...(invitation.metadata || {}),
          version: APP_VERSION,
          emergency_package_envelope: packageEnvelope,
          emergency_package_summary: cleanSummary,
          emergency_package_saved_at: now,
          emergency_package_source_fingerprint: sourceFingerprint,
          emergency_package_refresh_reason: refreshReason
        },
        updated_at: now
      });
      const automaticRefresh = ['vault_change', 'automatic_vault_refresh', 'vault_open_or_online', 'cloud_restore'].includes(refreshReason);
      const events = automaticRefresh
        ? buildEmergencyFlowEvents({ ...invitation, metadata: { ...(invitation.metadata || {}), emergency_package_summary: cleanSummary } }, requestRows || [])
        : await recordEmergencyFlowEvent(invitationId, { type: 'package_saved', title: 'Emergency package saved', message: 'The owner updated the encrypted emergency package.', occurredAt: now, metadata: { releaseScope: cleanSummary.releaseScope, itemCount: cleanSummary.itemCount, documentCount: cleanSummary.documentCount } });
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, packageSavedAt: now, packageSummary: cleanSummary, events, message: automaticRefresh ? 'Emergency release package automatically refreshed from the latest unlocked vault.' : 'Emergency release package encrypted and saved for the secure invite link.' });
    }

    if (action === 'status') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = sessionTenantId;
      const userId = sessionUserId;
      const contactEmail = String(body.contactEmail || '').trim().toLowerCase();
      if (!tenantId || !userId || (!invitationId && !contactEmail)) {
        return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      }

      const invitationSelect = 'select=id,status,sent_at,accepted_at,declined_at,cancelled_at,invite_url,contact_email,contact_name,created_at,metadata';
      const candidateInvites = [];

      if (invitationId) {
        const exactRows = await selectRows('emergency_access_invitations', `${invitationSelect}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&id=${eq(invitationId)}&limit=1`).catch(() => []);
        if (exactRows?.[0]?.id) candidateInvites.push(exactRows[0]);
      }

      if (contactEmail) {
        const emailRows = await selectRows('emergency_access_invitations', `${invitationSelect}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&contact_email=${eq(contactEmail)}&order=created_at.desc&limit=10`).catch(() => []);
        for (const row of (emailRows || [])) {
          if (row?.id && !candidateInvites.some((entry) => entry.id === row.id)) candidateInvites.push(row);
        }
      }

      if (!candidateInvites.length) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Invitation was not found.' });

      const activeRequestStatuses = ['requested', 'waiting', 'owner_notified'];
      const foundationReadyStatuses = ['release_ready'];
      const requestRows = [];
      for (const invite of candidateInvites.slice(0, 10)) {
        const rows = await selectRows('emergency_access_requests', `select=id,invitation_id,status,requested_at,waiting_ends_at,cancelled_at,released_at,contact_email,created_at,metadata&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&invitation_id=${eq(invite.id)}&order=requested_at.desc&limit=5`).catch(() => []);
        for (const row of (rows || [])) {
          if (row?.id && !requestRows.some((entry) => entry.id === row.id)) requestRows.push(row);
        }
      }

      if (contactEmail) {
        const emailRequestRows = await selectRows('emergency_access_requests', `select=id,invitation_id,status,requested_at,waiting_ends_at,cancelled_at,released_at,contact_email,created_at,metadata&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&contact_email=${eq(contactEmail)}&order=requested_at.desc&limit=10`).catch(() => []);
        for (const row of (emailRequestRows || [])) {
          if (row?.id && !requestRows.some((entry) => entry.id === row.id)) requestRows.push(row);
        }
      }

      const allRequests = requestRows
        .filter((row) => row?.id)
        .sort((a, b) => new Date(b.requested_at || b.created_at || 0) - new Date(a.requested_at || a.created_at || 0));
      let latestRequest = allRequests.find((row) => [...activeRequestStatuses, ...foundationReadyStatuses].includes(String(row.status || '').toLowerCase()) && !row.cancelled_at && !row.released_at) || allRequests[0] || null;

      let invitation = null;
      if (latestRequest?.invitation_id) invitation = candidateInvites.find((entry) => entry.id === latestRequest.invitation_id) || null;
      if (!invitation) invitation = candidateInvites.find((entry) => String(entry.status || '').toLowerCase() === 'accepted' && !entry.cancelled_at) || null;
      if (!invitation) invitation = candidateInvites.find((entry) => !entry.cancelled_at && ['sent', 'pending'].includes(String(entry.status || '').toLowerCase())) || candidateInvites[0];
      latestRequest = await markReleaseReadyIfDue(latestRequest, invitation);
      const requestStatus = String(latestRequest?.status || '').toLowerCase();
      const hasActiveRequest = latestRequest && activeRequestStatuses.includes(requestStatus) && !latestRequest.cancelled_at && !latestRequest.released_at;
      const isReleaseReady = latestRequest && foundationReadyStatuses.includes(requestStatus) && !latestRequest.cancelled_at && !latestRequest.released_at;

      // A request can only be created from an accepted invite. If the request exists but the older local plan still says sent,
      // surface the owner panel as accepted rather than leaving the UI stuck on Invitation sent.
      const invitationStatus = (hasActiveRequest || isReleaseReady) && !['declined', 'cancelled'].includes(String(invitation.status || '').toLowerCase())
        ? 'accepted'
        : (invitation.status || 'pending');
      const requestMessage = latestRequest
        ? (isReleaseReady
            ? 'The waiting period has ended. The selected emergency package release foundation is ready. The owner-prepared emergency package is ready if it has been saved.'
            : hasActiveRequest
              ? 'Emergency access requested. The waiting period has started. If you do not cancel before it ends, the selected emergency package will become available. No vault contents have been released yet.'
            : requestStatus === 'cancelled'
              ? 'Emergency access request cancelled. No vault contents were released.'
              : 'Emergency access request status checked. No vault contents have been released.')
        : '';

      const flowEvents = buildEmergencyFlowEvents(invitation, allRequests);
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        invitationId: invitation.id,
        ...invitation,
        status: invitationStatus,
        inviteUrl: invitation.invite_url || '',
        requestUrl: invitation.metadata?.request_access_url || withEmergencyStep(invitation.invite_url || '', 'request'),
        request: latestRequest ? {
          id: latestRequest.id,
          invitation_id: latestRequest.invitation_id || invitation.id,
          status: latestRequest.status,
          requested_at: latestRequest.requested_at,
          waiting_ends_at: latestRequest.waiting_ends_at,
          cancelled_at: latestRequest.cancelled_at || null,
          released_at: latestRequest.released_at || null,
          message: requestMessage
        } : null,
        releaseReady: isReleaseReady,
        packageSummary: invitation.metadata?.emergency_package_summary || null,
        events: flowEvents,
        message: isReleaseReady
          ? 'Waiting period ended. Emergency package is ready.'
          : hasActiveRequest
            ? 'Emergency access request is active.'
            : `Invitation status: ${invitationStatus}.`
      });
    }



    if (action === 'cancel') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = sessionTenantId;
      const userId = sessionUserId;
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      const now = new Date().toISOString();
      await updateRow('emergency_access_invitations', `id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, { status: 'cancelled', cancelled_at: now, updated_at: now });
      const events = await recordEmergencyFlowEvent(invitationId, { type: 'invitation_cancelled', title: 'Invitation cancelled', message: 'The account owner cancelled the trusted person invitation.', occurredAt: now });
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, status: 'cancelled', events, message: 'Trusted person invitation cancelled. No emergency access was granted.' });
    }

    if (action === 'reset' || action === 'reset_zero') {
      const tenantId = sessionTenantId;
      const userId = sessionUserId;
      if (!tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Account details are missing.' });
      const result = await resetEmergencyFlowToZero({ tenantId, userId });
      return jsonResponse(200, {
        ok: true, version: APP_VERSION, status: 'reset_zero', invitationsDeleted: result.invitationsDeleted, events: [],
        message: 'Trusted Person Access has been reset to zero. Trusted person details, invitations, request links, emergency requests and flow history have been removed.'
      });
    }

    if (action === 'resend_request_link') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = sessionTenantId;
      const userId = sessionUserId;
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      const rows = await selectRows('emergency_access_invitations', `select=*&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&id=${eq(invitationId)}&limit=1`);
      const invitation = rows?.[0];
      if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Invitation was not found.' });
      if (invitation.status === 'cancelled') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This invitation has been cancelled. Reset it and send a fresh invitation.' });
      if (invitation.status !== 'accepted') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'The trusted person must accept the invitation before a Request Access link can be resent.' });
      const requestUrl = invitation.metadata?.request_access_url || withEmergencyStep(invitation.invite_url || '', 'request');
      if (!requestUrl) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This invitation does not have a stored Request Access link. Reset it and send a fresh invitation.' });
      const delivery = await sendRequestLinkWithResend({
        to: invitation.contact_email,
        ownerName: invitation.metadata?.owner_name || 'Password-Encrypt user',
        ownerEmail: invitation.metadata?.owner_email || '',
        ownerPhone: invitation.metadata?.owner_phone || '',
        contactName: invitation.contact_name,
        waitingPeriod: invitation.waiting_period,
        accessScope: invitation.access_scope,
        requestUrl
      });
      const now = new Date().toISOString();
      await updateRow('emergency_access_invitations', `id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, {
        email_provider: delivery.provider || invitation.email_provider,
        email_provider_id: delivery.providerId || invitation.email_provider_id || '',
        expires_at: null,
        updated_at: now,
        metadata: {
          ...(invitation.metadata || {}),
          request_access_url: requestUrl,
          request_link_resent_at: now,
          request_link_email_sent: delivery.sent,
          request_link_provider_id: delivery.providerId || '',
          request_link_reason: delivery.sent ? null : (delivery.reason || null),
          version: APP_VERSION
        }
      });
      const events = await recordEmergencyFlowEvent(invitationId, { type: 'request_link_resent', title: 'Request Access link resent', message: delivery.sent ? 'The secure Request Access link was emailed again.' : 'A Request Access link resend was attempted but email delivery did not complete.', occurredAt: now });
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        invitationId,
        status: invitation.status,
        requestUrl,
        events,
        inviteUrl: requestUrl,
        emailSent: delivery.sent,
        message: delivery.sent ? 'Request Access link resent.' : `Request Access link is ready, but the email was not sent. ${delivery.reason || 'Use Copy request link for testing.'}`
      });
    }

    if (action === 'resend') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = sessionTenantId;
      const userId = sessionUserId;
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      const rows = await selectRows('emergency_access_invitations', `select=*&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&id=${eq(invitationId)}&limit=1`);
      const invitation = rows?.[0];
      if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Invitation was not found.' });
      if (invitation.status === 'cancelled') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This invitation has been cancelled. Reset it and send a fresh invitation.' });
      const inviteUrl = invitation.invite_url || '';
      if (!inviteUrl) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This older invitation does not have a stored invite link. Reset it and send a fresh invitation.' });
      const delivery = await sendWithResend({
        to: invitation.contact_email,
        ownerName: invitation.metadata?.owner_name || 'Password-Encrypt user',
        ownerEmail: invitation.metadata?.owner_email || '',
        ownerPhone: invitation.metadata?.owner_phone || '',
        contactName: invitation.contact_name,
        waitingPeriod: invitation.waiting_period,
        accessScope: invitation.access_scope,
        acceptUrl: inviteUrl
      });
      const now = new Date().toISOString();
      const nextStatus = delivery.sent ? 'sent' : (invitation.status || 'pending');
      await updateRow('emergency_access_invitations', `id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, {
        status: nextStatus,
        sent_at: delivery.sent ? now : invitation.sent_at,
        email_provider: delivery.provider || invitation.email_provider,
        email_provider_id: delivery.providerId || invitation.email_provider_id || '',
        updated_at: now,
        metadata: { ...(invitation.metadata || {}), resent_at: now, resend_email_sent: delivery.sent, resend_reason: delivery.reason || null, version: APP_VERSION }
      });
      const events = await recordEmergencyFlowEvent(invitationId, { type: 'invitation_resent', title: 'Invitation resent', message: delivery.sent ? 'The trusted person invitation was emailed again.' : 'The invitation resend was attempted but email delivery did not complete.', occurredAt: now });
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, status: nextStatus, emailSent: delivery.sent, sentAt: delivery.sent ? now : invitation.sent_at || '', inviteUrl, events, message: delivery.sent ? 'Trusted person invitation resent.' : `Invite link is ready, but the email was not sent. ${delivery.reason || 'Use Copy invite link for testing.'}` });
    }

    const tenantId = sessionTenantId;
    const userId = sessionUserId;
    const ownerRows = await selectRows('users', `select=display_name,email,phone_e164&id=${eq(sessionUserId)}&tenant_id=${eq(sessionTenantId)}&limit=1`).catch(() => []);
    const ownerProfile = ownerRows?.[0] || {};
    const ownerName = String(ownerProfile.display_name || body.ownerName || 'Password-Encrypt user').trim();
    const ownerEmail = String(ownerProfile.email || body.ownerEmail || '').trim().toLowerCase();
    const ownerPhone = String(ownerProfile.phone_e164 || body.ownerPhone || '').trim();
    const contactName = String(body.contactName || '').trim();
    const relationship = String(body.relationship || '').trim();
    const contactEmail = String(body.contactEmail || '').trim().toLowerCase();
    const contactPhone = String(body.contactPhone || '').trim();
    const waitingPeriod = String(body.waitingPeriod || '7 days').trim();
    const accessScope = String(body.accessScope || 'Emergency Info folder only').trim();

    if (!tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Account details are missing. Save account details first.' });
    if (!contactName) return jsonResponse(400, { ok: false, version: APP_VERSION, message: "Add the trusted person's name first." });
    if (!contactEmail || !contactEmail.includes('@')) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Add a valid email address for the trusted person.' });

    const existing = await selectRows('emergency_access_invitations', `select=id,status,invite_url,sent_at,accepted_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&contact_email=${eq(contactEmail)}&status=in.(sent,accepted,pending)&limit=1`);
    if (existing?.[0]?.id) {
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId: existing[0].id, status: existing[0].status, emailSent: false, inviteUrl: existing[0].invite_url || '', sentAt: existing[0].sent_at || '', acceptedAt: existing[0].accepted_at || '', message: 'This person has already been invited. You can resend, copy the invite link, check status, or reset the invite.' });
    }

    const invitationId = publicId('emergencyinvite');
    const token = randomBytes(32).toString('hex');
    const baseUrl = appBaseUrl(event);
    const inviteUrl = emergencyStepUrl(baseUrl, token, 'invite');
    const requestAccessUrl = emergencyStepUrl(baseUrl, token, 'request');
    const openAccessUrl = emergencyStepUrl(baseUrl, token, 'open');
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const delivery = await sendWithResend({ to: contactEmail, ownerName, ownerEmail, ownerPhone, contactName, waitingPeriod, accessScope, acceptUrl: inviteUrl });

    await insertRow('emergency_access_invitations', {
      id: invitationId,
      tenant_id: tenantId,
      user_id: userId,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      relationship,
      waiting_period: waitingPeriod,
      access_scope: accessScope,
      status: delivery.sent ? 'sent' : 'pending',
      invite_token_hash: tokenHash(token),
      invite_url: inviteUrl,
      email_provider: delivery.provider,
      email_provider_id: delivery.providerId || '',
      sent_at: delivery.sent ? now : null,
      expires_at: expiresAt,
      metadata: { version: APP_VERSION, owner_name: ownerName, owner_email: ownerEmail, owner_phone: ownerPhone, email_sent: delivery.sent, fallback_reason: delivery.reason || null, details: delivery.details || null, request_access_url: requestAccessUrl, open_access_url: openAccessUrl, link_flow: 'invite_request_open', flow_events: [{ id: `invitation_created:${now}:${invitationId}`, type: 'invitation_created', title: 'Trusted person invitation created', message: delivery.sent ? 'The trusted person was nominated and the invitation email was sent.' : 'The trusted person was nominated and the invitation link was prepared, but email delivery did not complete.', occurredAt: now, metadata: { invitationId }, version: APP_VERSION }] },
      created_at: now,
      updated_at: now
    });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      invitationId,
      status: delivery.sent ? 'sent' : 'pending',
      emailSent: delivery.sent,
      sentAt: delivery.sent ? now : '',
      acceptUrl: inviteUrl,
      inviteUrl,
      events: [{ id: `invitation_created:${now}:${invitationId}`, type: 'invitation_created', title: 'Trusted person invitation created', message: delivery.sent ? 'The trusted person was nominated and the invitation email was sent.' : 'The trusted person was nominated and the invitation link was prepared, but email delivery did not complete.', occurredAt: now, metadata: { invitationId }, version: APP_VERSION }],
      message: delivery.sent ? 'Trusted person invitation sent. Your trusted person now needs to accept or decline it.' : `Invitation link prepared, but the email was not sent. ${delivery.reason || 'Use Copy invite link for testing.'}`
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Emergency access invitation could not be prepared.', error: error.message, details: error.details || null });
  }
}
