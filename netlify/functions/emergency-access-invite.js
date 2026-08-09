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

function buildReleaseReadyEmail({ contactName, ownerName, accessScope, requestUrl }) {
  const safeContact = contactName || 'there';
  const safeOwner = ownerName || 'the account owner';
  const ownerFirst = firstName(safeOwner);
  const safeScope = accessScope || 'Emergency Info folder only';
  const buttonText = `Open ${ownerFirst}'s Vault`;
  const text = `Final stage: the waiting period for your Password-Encrypt access request for ${safeOwner} has ended without cancellation. The prepared ${safeScope} emergency package is now available through this secure browser link: ${requestUrl}. Nothing beyond the package prepared by ${safeOwner} is released. You do not need to install Password-Encrypt.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;"><div style="max-width:560px;margin:0 auto;padding:28px 18px;"><div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);"><h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">Final stage — emergency package ready</h1><p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeContact}, the waiting period for your Password-Encrypt access request for ${safeOwner} has ended.</p><p style="margin:0 0 18px;line-height:1.55;color:#536579;">The waiting period has completed without cancellation. You can now use this secure browser link to open only the emergency package ${safeOwner} prepared for you.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;"><p style="margin:0;"><strong>Access scope:</strong> ${safeScope}</p></div>${requestUrl ? `<a href="${requestUrl}" style="display:inline-block;background:#173a5d;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700;">${buttonText}</a>` : ''}<p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">You do not need to install Password-Encrypt. This secure link opens in your browser. If you cannot find this email later, check your Spam or Junk folder first.</p></div></div></body></html>`;
  return { html, text, subject: `Final stage: ${ownerFirst}'s emergency package is ready` };
}

async function notifyEmergencyContactReleaseReady({ invitation, request }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  const metadata = invitation?.metadata || {};
  if (metadata.release_ready_email_sent || request?.metadata?.release_ready_email_sent) return { sent: false, skipped: true, reason: 'Release-ready email was already sent.' };
  const to = invitation?.contact_email || request?.contact_email || '';
  if (!apiKey || !from || !to || !to.includes('@')) return { sent: false, provider: 'resend', reason: 'Release-ready email is not configured.' };
  const requestUrl = metadata.open_access_url || withEmergencyStep(invitation?.invite_url || metadata.request_access_url || '', 'open');
  const content = buildReleaseReadyEmail({ contactName: invitation?.contact_name || request?.contact_name, ownerName: metadata.owner_name || 'the account owner', accessScope: invitation?.access_scope || request?.access_scope, requestUrl });
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
  const releaseEmail = invitation ? await notifyEmergencyContactReleaseReady({ invitation, request }).catch((error) => ({ sent: false, reason: error.message || 'Release-ready email failed.' })) : null;
  const nextMetadata = {
    ...(request.metadata || {}),
    version: APP_VERSION,
    release_foundation_ready: true,
    release_ready_at: now,
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

function buildInviteEmail({ ownerName, contactName, waitingPeriod, accessScope, acceptUrl }) {
  const safeOwner = ownerName || 'A Password-Encrypt user';
  const ownerFirst = firstName(safeOwner);
  const safeContact = contactName || 'there';
  const safeWaiting = waitingPeriod || '7 days';
  const safeScope = accessScope || 'Emergency Info folder only';
  const text = `Hello ${safeContact}. Stage 1: ${safeOwner} has nominated you as their trusted person / next of kin contact in Password-Encrypt. This nomination is intended for a serious emergency, incapacity, or a situation where ${safeOwner} cannot access their own vault. Nothing from the vault is available to you now. Please review and accept or decline here: ${acceptUrl}. If you accept, Password-Encrypt sends you a separate secure Request Access link to keep for the future. If you ever use that link, a ${safeWaiting} waiting period starts and ${safeOwner} is notified and can cancel. Only if that period ends without cancellation will the prepared ${safeScope} emergency package become available. You do not need to install Password-Encrypt.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><p style="margin:0 0 8px;color:#336699;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Stage 1 · Nomination</p><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">${ownerFirst} has nominated you as a trusted person</h1><p style="margin:0 0 16px;line-height:1.6;color:#536579">Hello ${safeContact}, this is intended for a serious emergency, incapacity, or a situation where ${safeOwner} cannot access their own vault.</p><p style="margin:0 0 16px;line-height:1.6;color:#536579"><strong>Nothing from the vault is available to you at this stage.</strong> Please review the nomination and accept or decline it.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><p style="margin:0 0 8px"><strong>Waiting period if access is later requested:</strong> ${safeWaiting}</p><p style="margin:0"><strong>Prepared access scope:</strong> ${safeScope}</p></div><a href="${acceptUrl}" style="display:inline-block;background:#173a5d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">Review nomination</a><p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#7b8fa3"><strong>What happens next?</strong> If you accept, you receive a separate Request Access link. Using it in a genuine emergency starts the waiting period and notifies ${safeOwner}. ${safeOwner} can cancel before the period ends. Only after the period ends without cancellation can the prepared emergency package be opened.</p></div></div></body></html>`;
  return { html, text, subject: `Stage 1: ${ownerFirst} nominated you as a Password-Encrypt trusted person` };
}

function buildRequestLinkEmail({ ownerName, contactName, waitingPeriod, accessScope, requestUrl }) {
  const safeOwner = ownerName || 'the account owner';
  const ownerFirst = firstName(safeOwner);
  const safeContact = contactName || 'there';
  const safeWaiting = waitingPeriod || '7 days';
  const safeScope = accessScope || 'Emergency Info folder only';
  const text = `Hello ${safeContact}. Stage 2: your nomination for ${safeOwner} is accepted. Keep this secure link somewhere safe for a genuine emergency: ${requestUrl}. Nothing from the vault is available yet. Using this link starts the ${safeWaiting} waiting period and immediately notifies ${safeOwner}. ${safeOwner} can cancel during that period. Only if the waiting period ends without cancellation will the prepared ${safeScope} emergency package become available. You do not need to install Password-Encrypt.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><p style="margin:0 0 8px;color:#336699;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Stage 2 · Accepted</p><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">Keep your emergency Request Access link safe</h1><p style="margin:0 0 16px;line-height:1.6;color:#536579">Hello ${safeContact}, your trusted person nomination for ${safeOwner} has been accepted.</p><p style="margin:0 0 16px;line-height:1.6;color:#536579"><strong>Nothing from the vault is available yet.</strong> Use the link below only if a genuine emergency means you need to request access.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><p style="margin:0 0 8px"><strong>Waiting period:</strong> ${safeWaiting}</p><p style="margin:0"><strong>Prepared access scope:</strong> ${safeScope}</p></div><a href="${requestUrl}" style="display:inline-block;background:#173a5d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">Request emergency access for ${ownerFirst}</a><p style="margin:20px 0 0;font-size:13px;line-height:1.55;color:#7b8fa3">Using this link starts the waiting period and notifies ${safeOwner}. ${safeOwner} can cancel before the period ends. If it completes without cancellation, you receive a final email when the prepared package is ready.</p></div></div></body></html>`;
  return { html, text, subject: `Stage 2: Your Password-Encrypt emergency link for ${ownerFirst}` };
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
        subject: content.subject || 'Your Password-Encrypt link',
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

async function sendWithResend({ to, ownerName, contactName, waitingPeriod, accessScope, acceptUrl }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) {
    return { sent: false, provider: 'resend', reason: 'Email sending is not configured yet. The invite link was still created and can be copied manually.' };
  }
  const content = buildInviteEmail({ ownerName, contactName, waitingPeriod, accessScope, acceptUrl });
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
      const now = new Date().toISOString();
      const cleanSummary = {
        releaseScope: packageSummary.releaseScope || invitation.access_scope || 'Emergency Info folder only',
        fullVaultAccess: Boolean(packageSummary.fullVaultAccess),
        itemCount: Number(packageSummary.itemCount || 0),
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
          emergency_package_saved_at: now
        },
        updated_at: now
      });
      const events = await recordEmergencyFlowEvent(invitationId, { type: 'package_saved', title: 'Emergency package saved', message: 'The owner updated the encrypted emergency package.', occurredAt: now, metadata: { releaseScope: cleanSummary.releaseScope, itemCount: cleanSummary.itemCount } });
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, packageSavedAt: now, packageSummary: cleanSummary, events, message: 'Emergency release package encrypted and saved for the secure invite link.' });
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
        packageSummary: isReleaseReady ? (invitation.metadata?.emergency_package_summary || null) : null,
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
    const ownerName = String(body.ownerName || 'Password-Encrypt user').trim();
    const ownerEmail = String(body.ownerEmail || '').trim().toLowerCase();
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
    const delivery = await sendWithResend({ to: contactEmail, ownerName, contactName, waitingPeriod, accessScope, acceptUrl: inviteUrl });

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
      metadata: { version: APP_VERSION, owner_name: ownerName, owner_email: ownerEmail, email_sent: delivery.sent, fallback_reason: delivery.reason || null, details: delivery.details || null, request_access_url: requestAccessUrl, open_access_url: openAccessUrl, link_flow: 'invite_request_open', flow_events: [{ id: `invitation_created:${now}:${invitationId}`, type: 'invitation_created', title: 'Trusted person invitation created', message: delivery.sent ? 'The trusted person was nominated and the invitation email was sent.' : 'The trusted person was nominated and the invitation link was prepared, but email delivery did not complete.', occurredAt: now, metadata: { invitationId }, version: APP_VERSION }] },
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
