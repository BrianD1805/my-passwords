import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { createHash } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function tokenHash(token) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite';
  return createHash('sha256').update(`${token}:${secret}`).digest('hex');
}

function waitingPeriodMs(value) {
  const text = String(value || '7 days').toLowerCase();
  const amount = Number.parseInt(text, 10) || 7;
  if (text.includes('hour')) return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}

function hasWaitingPeriodEnded(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

async function markReleaseReadyIfDue(request) {
  const status = String(request?.status || '').toLowerCase();
  if (!request?.id || !['requested', 'waiting', 'owner_notified'].includes(status) || request.cancelled_at || request.released_at || !hasWaitingPeriodEnded(request.waiting_ends_at)) {
    return request;
  }
  const now = new Date().toISOString();
  const updated = await updateRow('emergency_access_requests', `id=${eq(request.id)}`, {
    status: 'release_ready',
    metadata: { ...(request.metadata || {}), version: APP_VERSION, release_foundation_ready: true, release_ready_at: now, release_note: 'Waiting period ended. Selected emergency package release foundation is ready; no vault contents are included in this record.' },
    updated_at: now
  }).catch(() => null);
  return updated || { ...request, status: 'release_ready', metadata: { ...(request.metadata || {}), release_foundation_ready: true, release_ready_at: now } };
}

function buildOwnerNotification({ ownerName, contactName, waitingPeriod, accessScope, requestedAt, waitingEndsAt }) {
  const safeOwner = ownerName || 'there';
  const safeContact = contactName || 'Your trusted person';
  const text = `${safeOwner}, ${safeContact} has requested emergency access in My Passwords. No vault contents have been released yet. If you do not cancel before the waiting period ends, the selected emergency package can become available. Waiting period: ${waitingPeriod || '7 days'}. Planned access scope: ${accessScope || 'Emergency Info folder only'}. Requested: ${requestedAt}. Waiting period ends: ${waitingEndsAt}. Open your vault settings to review or cancel this request before the waiting period ends.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);">
        <h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">Emergency access request</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeOwner}, ${safeContact} has requested emergency access in My Passwords.</p>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">No vault contents have been released yet. If you do not cancel before the waiting period ends, your selected emergency package can become available to your trusted person.</p>
        <div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;">
          <p style="margin:0 0 8px;"><strong>Waiting period:</strong> ${waitingPeriod || '7 days'}</p>
          <p style="margin:0 0 8px;"><strong>Planned access scope:</strong> ${accessScope || 'Emergency Info folder only'}</p>
          <p style="margin:0;"><strong>Waiting period ends:</strong> ${waitingEndsAt}</p>
        </div>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">Open your vault settings to review or cancel this request before the waiting period ends.</p>
      </div>
    </div>
  </body>
</html>`;
  return { html, text };
}

async function notifyOwner({ ownerEmail, ownerName, contactName, waitingPeriod, accessScope, requestedAt, waitingEndsAt }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from || !ownerEmail || !ownerEmail.includes('@')) {
    return { sent: false, provider: 'resend', reason: 'Owner email notification is not configured.' };
  }
  const content = buildOwnerNotification({ ownerName, contactName, waitingPeriod, accessScope, requestedAt, waitingEndsAt });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: ownerEmail,
        subject: 'Emergency access request for My Passwords',
        html: content.html,
        text: content.text
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
    return { sent: true, provider: 'resend', providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, provider: 'resend', reason: error.name === 'AbortError' ? 'Owner email notification timed out, but the request was recorded.' : (error.message || 'Owner email notification could not be sent.') };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const body = parseBody(event);
  const action = String(body.action || 'request').trim();

  try {
    if (action === 'cancel_by_owner') {
      const requestId = String(body.requestId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
      if (!requestId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Request details are missing.' });
      await updateRow('emergency_access_requests', `id=${eq(requestId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, { status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return jsonResponse(200, { ok: true, version: APP_VERSION, requestId, status: 'cancelled', message: 'Emergency access request cancelled. No vault access has been released.' });
    }

    const token = String(body.token || '').trim();
    if (!token) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation token is missing.' });

    const rows = await selectRows('emergency_access_invitations', `select=*&invite_token_hash=${eq(tokenHash(token))}&limit=1`);
    const invitation = rows?.[0];
    if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This invitation link was not found or has expired.' });
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This invitation has expired. Please ask the account owner to send a new one.' });

    const existing = await selectRows('emergency_access_requests', `select=*&invitation_id=${eq(invitation.id)}&status=in.(requested,waiting,owner_notified,release_ready)&order=requested_at.desc&limit=1`);

    if (action === 'status') {
      const currentRequest = existing?.[0]?.id ? await markReleaseReadyIfDue(existing[0]) : null;
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        invitationId: invitation.id,
        invitationStatus: invitation.status,
        invitationMessage: invitation.status === 'accepted'
          ? 'Invitation accepted. You can request emergency access if needed.'
          : invitation.status === 'declined'
            ? 'Invitation declined. No access has been granted.'
            : invitation.status === 'cancelled'
              ? 'This invitation has been cancelled by the account owner.'
              : 'Invitation found. Please accept the invitation before requesting emergency access.',
        requestId: currentRequest?.id || '',
        status: currentRequest?.status || 'not_requested',
        requestedAt: currentRequest?.requested_at || '',
        waitingEndsAt: currentRequest?.waiting_ends_at || '',
        releaseReady: String(currentRequest?.status || '').toLowerCase() === 'release_ready',
        packageEnvelope: String(currentRequest?.status || '').toLowerCase() === 'release_ready' ? (invitation.metadata?.emergency_package_envelope || null) : null,
        packageSummary: String(currentRequest?.status || '').toLowerCase() === 'release_ready' ? (invitation.metadata?.emergency_package_summary || null) : null,
        message: currentRequest?.id
          ? (String(currentRequest.status || '').toLowerCase() === 'release_ready'
              ? 'The waiting period has ended. The owner-prepared emergency package is ready if it has been saved.'
              : 'Emergency access request is active. The owner can cancel before the waiting period ends.')
          : ''
      });
    }

    if (invitation.status !== 'accepted') return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Accept the emergency contact invitation before requesting emergency access.' });

    if (existing?.[0]?.id) {
      const currentRequest = await markReleaseReadyIfDue(existing[0]);
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        requestId: currentRequest.id,
        status: currentRequest.status,
        requestedAt: currentRequest.requested_at,
        waitingEndsAt: currentRequest.waiting_ends_at,
        releaseReady: String(currentRequest.status || '').toLowerCase() === 'release_ready',
        packageEnvelope: String(currentRequest.status || '').toLowerCase() === 'release_ready' ? (invitation.metadata?.emergency_package_envelope || null) : null,
        packageSummary: String(currentRequest.status || '').toLowerCase() === 'release_ready' ? (invitation.metadata?.emergency_package_summary || null) : null,
        message: String(currentRequest.status || '').toLowerCase() === 'release_ready'
          ? 'The waiting period has ended. The owner-prepared emergency package is ready if it has been saved.'
          : 'Emergency access request is already active. The owner has until the waiting period ends to cancel it. No vault contents have been released.'
      });
    }

    const now = new Date();
    const requestedAt = now.toISOString();
    const waitingEndsAt = new Date(now.getTime() + waitingPeriodMs(invitation.waiting_period)).toISOString();
    const requestId = publicId('emergencyrequest');
    const ownerName = invitation.metadata?.owner_name || 'there';
    const ownerEmail = invitation.metadata?.owner_email || '';
    await insertRow('emergency_access_requests', {
      id: requestId,
      invitation_id: invitation.id,
      tenant_id: invitation.tenant_id,
      user_id: invitation.user_id,
      contact_email: invitation.contact_email,
      contact_name: invitation.contact_name,
      waiting_period: invitation.waiting_period,
      access_scope: invitation.access_scope,
      status: 'requested',
      requested_at: requestedAt,
      waiting_ends_at: waitingEndsAt,
      owner_notified_at: null,
      email_provider: 'resend',
      email_provider_id: '',
      metadata: { version: APP_VERSION, notification_sent: false, notification_reason: 'Notification pending.' },
      created_at: requestedAt,
      updated_at: requestedAt
    });

    const notification = await notifyOwner({
      ownerEmail,
      ownerName,
      contactName: invitation.contact_name,
      waitingPeriod: invitation.waiting_period,
      accessScope: invitation.access_scope,
      requestedAt,
      waitingEndsAt
    });

    if (notification.sent) {
      await updateRow('emergency_access_requests', `id=${eq(requestId)}`, {
        status: 'owner_notified',
        owner_notified_at: requestedAt,
        email_provider: notification.provider,
        email_provider_id: notification.providerId || '',
        metadata: { version: APP_VERSION, notification_sent: true },
        updated_at: new Date().toISOString()
      });
    } else {
      await updateRow('emergency_access_requests', `id=${eq(requestId)}`, {
        email_provider: notification.provider,
        metadata: { version: APP_VERSION, notification_sent: false, notification_reason: notification.reason || null, notification_details: notification.details || null },
        updated_at: new Date().toISOString()
      });
    }

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      requestId,
      status: notification.sent ? 'owner_notified' : 'requested',
      requestedAt,
      waitingEndsAt,
      message: notification.sent
        ? 'Emergency access request sent to the account owner. If the owner does not cancel before the waiting period ends, the selected emergency package can become available. No vault contents have been released yet.'
        : 'Emergency access request recorded. If the owner does not cancel before the waiting period ends, the selected emergency package can become available. No vault contents have been released yet.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Emergency access request could not be saved.', error: error.message, details: error.details || null });
  }
}
