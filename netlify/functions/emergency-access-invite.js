import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { createHash, randomBytes } from 'node:crypto';

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
  const text = `Hello ${safeContact}, the waiting period for your My Passwords access request for ${safeOwner} has ended. If ${safeOwner} has not cancelled the request, use this fresh secure browser link to open the prepared emergency package: ${requestUrl}. Button text: ${buttonText}. Access scope: ${safeScope}. If you cannot find this email later, check your Spam or Junk folder first.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;"><div style="max-width:560px;margin:0 auto;padding:28px 18px;"><div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);"><h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">${ownerFirst}'s vault is ready</h1><p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeContact}, the waiting period for your My Passwords access request for ${safeOwner} has ended.</p><p style="margin:0 0 18px;line-height:1.55;color:#536579;">If ${safeOwner} has not cancelled the request, you can now use this secure browser link to open the prepared emergency package.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;"><p style="margin:0;"><strong>Access scope:</strong> ${safeScope}</p></div>${requestUrl ? `<a href="${requestUrl}" style="display:inline-block;background:#173a5d;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700;">${buttonText}</a>` : ''}<p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">You do not need to install My Passwords. This secure link opens in your browser. If you cannot find this email later, check your Spam or Junk folder first.</p></div></div></body></html>`;
  return { html, text, subject: `${ownerFirst}'s My Passwords vault is ready` };
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
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ from, to, subject: content.subject || 'My Passwords access is ready', html: content.html, text: content.text }) });
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
  const safeOwner = ownerName || 'A My Passwords user';
  const ownerFirst = firstName(safeOwner);
  const safeContact = contactName || 'there';
  const text = `Hello ${safeContact}, ${safeOwner} has nominated you as their trusted person in My Passwords. Step 1 is to review and accept or decline the nomination. This email does not give access to passwords. If you accept, a separate secure Request Access link will be emailed to you for future use. You do not need the app; the link opens in a browser. Waiting period: ${waitingPeriod || '7 days'}. Planned access scope: ${accessScope || 'Emergency Info folder only'}. Review: ${acceptUrl}. If you expected this email but cannot find it later, check Spam or Junk first.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);">
        <h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">${ownerFirst} has nominated you</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeContact}, ${safeOwner} has nominated you as their trusted person in My Passwords.</p>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Step 1 is to review and accept or decline the nomination. This does not give you access to any passwords today.</p>
        <div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;">
          <p style="margin:0 0 8px;"><strong>Waiting period:</strong> ${waitingPeriod || '7 days'}</p>
          <p style="margin:0;"><strong>Planned access scope:</strong> ${accessScope || 'Emergency Info folder only'}</p>
        </div>
        <a href="${acceptUrl}" style="display:inline-block;background:#1d3557;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700;">Review nomination</a>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">Next step: if you accept, My Passwords will send a separate secure Request Access link for future use. If you cannot find the email later, check your Spam or Junk folder first.</p>
      </div>
    </div>
  </body>
</html>`;
  return { html, text, subject: `${ownerFirst} nominated you in My Passwords` };
}


function buildRequestLinkEmail({ ownerName, contactName, waitingPeriod, accessScope, requestUrl }) {
  const safeOwner = ownerName || 'The account owner';
  const ownerFirst = firstName(safeOwner);
  const safeContact = contactName || 'there';
  const text = `Hello ${safeContact}, this is your secure My Passwords Request Access link for ${safeOwner}. Keep this email somewhere safe. If there is ever an emergency, use the browser link to request access: ${requestUrl}. This link does not release any vault contents by itself. It starts the waiting period and notifies ${safeOwner}. Waiting period: ${waitingPeriod || '7 days'}. Planned access scope: ${accessScope || 'Emergency Info folder only'}. After the waiting period ends, you should receive another email with a fresh Open ${ownerFirst}'s Vault link. If no email arrives, check Spam or Junk first.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);">
        <h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">Your link for ${ownerFirst}</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeContact}, this is your secure My Passwords Request Access link for ${safeOwner}.</p>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Keep this email somewhere safe. Use this link only if you need to request emergency access.</p>
        <div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;">
          <p style="margin:0 0 8px;"><strong>Waiting period:</strong> ${waitingPeriod || '7 days'}</p>
          <p style="margin:0;"><strong>Planned access scope:</strong> ${accessScope || 'Emergency Info folder only'}</p>
        </div>
        <a href="${requestUrl}" style="display:inline-block;background:#1d3557;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700;">Request access for ${ownerFirst}</a>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">Next step: if you request access, ${safeOwner} is notified and can cancel during the waiting period. If the waiting period ends without cancellation, watch for a fresh email with an Open ${ownerFirst}'s Vault link. Check Spam or Junk if you do not see it.</p>
      </div>
    </div>
  </body>
</html>`;
  return { html, text, subject: `Your My Passwords link for ${ownerFirst}` };
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
        subject: content.subject || 'Your My Passwords link',
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
        subject: content.subject || 'My Passwords trusted person nomination',
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

  try {
    if (action === 'save_package') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
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
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, packageSavedAt: now, packageSummary: cleanSummary, message: 'Emergency release package encrypted and saved for the secure invite link.' });
    }

    if (action === 'status') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
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

      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        invitationId: invitation.id,
        ...invitation,
        status: invitationStatus,
        inviteUrl: invitation.invite_url || '',
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
        message: isReleaseReady
          ? 'Waiting period ended. Emergency package is ready.'
          : hasActiveRequest
            ? 'Emergency access request is active.'
            : `Invitation status: ${invitationStatus}.`
      });
    }



    if (action === 'cancel') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      await updateRow('emergency_access_invitations', `id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, { status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, status: 'cancelled', message: 'Emergency access invitation cancelled.' });
    }

    if (action === 'reset') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      await updateRow('emergency_access_invitations', `id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, { status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { reset_by_owner: true, reset_at: new Date().toISOString(), version: APP_VERSION } });
      await updateRow('emergency_access_requests', `invitation_id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&status=${inList(['requested','waiting','owner_notified','release_ready'])}`, { status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { cancelled_by_owner_reset: true, version: APP_VERSION } }).catch(() => null);
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, status: 'reset', message: 'Emergency invitation reset. You can send a fresh invite now.' });
    }

    if (action === 'resend_request_link') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
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
        ownerName: invitation.metadata?.owner_name || 'My Passwords user',
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
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        invitationId,
        status: invitation.status,
        requestUrl,
        inviteUrl: requestUrl,
        emailSent: delivery.sent,
        message: delivery.sent ? 'Request Access link resent.' : `Request Access link is ready, but the email was not sent. ${delivery.reason || 'Use Copy request link for testing.'}`
      });
    }

    if (action === 'resend') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      const rows = await selectRows('emergency_access_invitations', `select=*&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&id=${eq(invitationId)}&limit=1`);
      const invitation = rows?.[0];
      if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Invitation was not found.' });
      if (invitation.status === 'cancelled') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This invitation has been cancelled. Reset it and send a fresh invitation.' });
      const inviteUrl = invitation.invite_url || '';
      if (!inviteUrl) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'This older invitation does not have a stored invite link. Reset it and send a fresh invitation.' });
      const delivery = await sendWithResend({
        to: invitation.contact_email,
        ownerName: invitation.metadata?.owner_name || 'My Passwords user',
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
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, status: nextStatus, emailSent: delivery.sent, sentAt: delivery.sent ? now : invitation.sent_at || '', inviteUrl, message: delivery.sent ? 'Emergency invitation resent.' : `Invite link is ready, but the email was not sent. ${delivery.reason || 'Use Copy invite link for testing.'}` });
    }

    const tenantId = String(body.tenantId || '').trim();
    const userId = String(body.userId || '').trim();
    const ownerName = String(body.ownerName || 'My Passwords user').trim();
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
      metadata: { version: APP_VERSION, owner_name: ownerName, owner_email: ownerEmail, email_sent: delivery.sent, fallback_reason: delivery.reason || null, details: delivery.details || null, request_access_url: requestAccessUrl, open_access_url: openAccessUrl, link_flow: 'invite_request_open' },
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
      message: delivery.sent ? 'Emergency contact invitation sent.' : `Invitation link prepared, but the email was not sent. ${delivery.reason || 'Use Copy invite link for testing.'}`
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Emergency access invitation could not be prepared.', error: error.message, details: error.details || null });
  }
}
