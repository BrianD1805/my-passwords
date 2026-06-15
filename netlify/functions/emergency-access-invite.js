import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, requirePost, selectRows, updateRow } from './_db.js';
import { createHash, randomBytes } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function tokenHash(token) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite';
  return createHash('sha256').update(`${token}:${secret}`).digest('hex');
}

function appBaseUrl(event) {
  const envUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
  if (envUrl) return envUrl.replace(/\/$/, '');
  const host = event.headers?.host || 'password-encrypt.com';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

function buildInviteEmail({ ownerName, contactName, waitingPeriod, accessScope, acceptUrl }) {
  const safeOwner = ownerName || 'A My Passwords user';
  const safeContact = contactName || 'there';
  const text = `${safeOwner} has nominated you as their trusted emergency contact in My Passwords. This invitation does not give you access to any passwords today. If you accept, you are only confirming that you are willing to be listed as their trusted person. Waiting period: ${waitingPeriod || '7 days'}. Access scope planned: ${accessScope || 'Emergency Info folder only'}. Accept or decline: ${acceptUrl}`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);">
        <h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">Emergency contact invitation</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeContact}, ${safeOwner} has nominated you as their trusted emergency contact in My Passwords.</p>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">This does not give you access to any passwords today. It simply confirms that you are willing to be listed as their trusted person if emergency access is enabled later.</p>
        <div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;">
          <p style="margin:0 0 8px;"><strong>Waiting period:</strong> ${waitingPeriod || '7 days'}</p>
          <p style="margin:0;"><strong>Planned access scope:</strong> ${accessScope || 'Emergency Info folder only'}</p>
        </div>
        <a href="${acceptUrl}" style="display:inline-block;background:#1d3557;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700;">Review invitation</a>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">The account owner stays in control. Emergency release rules will be added carefully in a later step.</p>
      </div>
    </div>
  </body>
</html>`;
  return { html, text };
}

async function sendWithResend({ to, ownerName, contactName, waitingPeriod, accessScope, acceptUrl }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) {
    return { sent: false, provider: 'resend', reason: 'Email sending is not configured yet.' };
  }
  const content = buildInviteEmail({ ownerName, contactName, waitingPeriod, accessScope, acceptUrl });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: 'Emergency contact invitation for My Passwords',
      html: content.html,
      text: content.text
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
  return { sent: true, provider: 'resend', providerId: data?.id || '' };
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const body = parseBody(event);
  const action = String(body.action || 'send').trim();

  try {
    if (action === 'status') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      const rows = await selectRows('emergency_access_invitations', `select=id,status,sent_at,accepted_at,declined_at,cancelled_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&id=${eq(invitationId)}&limit=1`);
      const invitation = rows?.[0];
      if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Invitation was not found.' });
      const requestRows = await selectRows('emergency_access_requests', `select=id,status,requested_at,waiting_ends_at,cancelled_at,metadata&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&invitation_id=${eq(invitationId)}&order=requested_at.desc&limit=1`).catch(() => []);
      const latestRequest = requestRows?.[0] || null;
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, ...invitation, request: latestRequest ? { id: latestRequest.id, status: latestRequest.status, requested_at: latestRequest.requested_at, waiting_ends_at: latestRequest.waiting_ends_at, message: latestRequest.status === 'cancelled' ? 'Emergency access request cancelled.' : 'Emergency access request is active. No vault contents have been released.' } : null, message: `Invitation status: ${invitation.status}.` });
    }

    if (action === 'cancel') {
      const invitationId = String(body.invitationId || '').trim();
      const tenantId = String(body.tenantId || '').trim();
      const userId = String(body.userId || '').trim();
      if (!invitationId || !tenantId || !userId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation details are missing.' });
      await updateRow('emergency_access_invitations', `id=${eq(invitationId)}&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`, { status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId, status: 'cancelled', message: 'Emergency access invitation cancelled.' });
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

    const existing = await selectRows('emergency_access_invitations', `select=id,status&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&contact_email=${eq(contactEmail)}&status=in.(sent,accepted,pending)&limit=1`);
    if (existing?.[0]?.id) {
      return jsonResponse(200, { ok: true, version: APP_VERSION, invitationId: existing[0].id, status: existing[0].status, emailSent: false, message: 'An invitation already exists for this trusted person.' });
    }

    const invitationId = publicId('emergencyinvite');
    const token = randomBytes(32).toString('hex');
    const inviteUrl = `${appBaseUrl(event)}/emergency-invite?token=${encodeURIComponent(token)}`;
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
      metadata: { version: APP_VERSION, owner_name: ownerName, owner_email: ownerEmail, email_sent: delivery.sent, fallback_reason: delivery.reason || null, details: delivery.details || null },
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
      acceptUrl: delivery.sent ? '' : inviteUrl,
      message: delivery.sent ? 'Emergency contact invitation sent.' : 'Invitation prepared, but email sending is not configured yet.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Emergency access invitation could not be prepared.', error: error.message, details: error.details || null });
  }
}
