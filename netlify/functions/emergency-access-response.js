import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows, updateRow } from './_db.js';
import { createHash } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function tokenHash(token) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite';
  return createHash('sha256').update(`${token}:${secret}`).digest('hex');
}

function buildAcceptedEmail({ ownerName, contactName, waitingPeriod, accessScope, requestUrl }) {
  const safeOwner = ownerName || 'The account owner';
  const safeContact = contactName || 'there';
  const text = `Hello ${safeContact}, you have accepted ${safeOwner}'s Emergency Access invitation for My Passwords. Keep this email somewhere safe. If there is ever an emergency, you can use this secure browser link to request access: ${requestUrl}. This link does not release any vault contents by itself. It starts the waiting period and notifies the account owner. Waiting period: ${waitingPeriod || '7 days'}. Planned access scope: ${accessScope || 'Emergency Info folder only'}.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);">
        <h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">Emergency Access accepted</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeContact}, you have accepted ${safeOwner}'s Emergency Access invitation for My Passwords.</p>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Keep this email somewhere safe. If there is ever an emergency, use the secure link below to request access.</p>
        <div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;">
          <p style="margin:0 0 8px;"><strong>Waiting period:</strong> ${waitingPeriod || '7 days'}</p>
          <p style="margin:0;"><strong>Planned access scope:</strong> ${accessScope || 'Emergency Info folder only'}</p>
        </div>
        <a href="${requestUrl}" style="display:inline-block;background:#1d3557;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700;">Request emergency access</a>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">This link does not release any vault contents by itself. It starts the waiting period and notifies the account owner.</p>
      </div>
    </div>
  </body>
</html>`;
  return { html, text };
}

async function sendAcceptedConfirmation({ to, ownerName, contactName, waitingPeriod, accessScope, requestUrl }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from || !to || !to.includes('@') || !requestUrl) {
    return { sent: false, provider: 'resend', reason: 'Accepted confirmation email is not configured or the request link is missing.' };
  }
  const content = buildAcceptedEmail({ ownerName, contactName, waitingPeriod, accessScope, requestUrl });
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
        subject: 'Your My Passwords Emergency Access link',
        html: content.html,
        text: content.text
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, provider: 'resend', reason: data?.message || `Resend returned HTTP ${response.status}.`, details: data };
    return { sent: true, provider: 'resend', providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, provider: 'resend', reason: error.name === 'AbortError' ? 'Accepted confirmation email timed out.' : (error.message || 'Accepted confirmation email could not be sent.') };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const body = parseBody(event);
  const token = String(body.token || '').trim();
  const responseStatus = String(body.response || '').trim() === 'declined' ? 'declined' : 'accepted';
  if (!token) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation token is missing.' });

  try {
    const rows = await selectRows('emergency_access_invitations', `select=id,status,expires_at,contact_name,contact_email,invite_url,waiting_period,access_scope,metadata&invite_token_hash=${eq(tokenHash(token))}&limit=1`);
    const invitation = rows?.[0];
    if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This invitation link was not found or has expired.' });
    if (invitation.status === 'cancelled') return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This invitation has been cancelled by the account owner.' });
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This invitation has expired. Please ask the account owner to send a new one.' });

    const now = new Date().toISOString();
    const requestUrl = invitation.invite_url || '';
    const confirmation = responseStatus === 'accepted'
      ? await sendAcceptedConfirmation({
          to: invitation.contact_email,
          ownerName: invitation.metadata?.owner_name || 'the account owner',
          contactName: invitation.contact_name,
          waitingPeriod: invitation.waiting_period,
          accessScope: invitation.access_scope,
          requestUrl
        })
      : { sent: false };

    await updateRow('emergency_access_invitations', `id=${eq(invitation.id)}`, {
      status: responseStatus,
      accepted_at: responseStatus === 'accepted' ? now : null,
      declined_at: responseStatus === 'declined' ? now : null,
      expires_at: responseStatus === 'accepted' ? null : invitation.expires_at,
      email_provider: confirmation.sent ? confirmation.provider : invitation.email_provider,
      email_provider_id: confirmation.sent ? confirmation.providerId || '' : invitation.email_provider_id || '',
      metadata: {
        ...(invitation.metadata || {}),
        accepted_confirmation_sent: !!confirmation.sent,
        accepted_confirmation_sent_at: confirmation.sent ? now : null,
        accepted_confirmation_provider_id: confirmation.providerId || '',
        accepted_confirmation_reason: confirmation.sent ? null : (confirmation.reason || null),
        request_access_url: requestUrl,
        request_link_available: responseStatus === 'accepted',
        version: APP_VERSION
      },
      updated_at: now
    });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      status: responseStatus,
      requestUrl,
      confirmationEmailSent: !!confirmation.sent,
      message: responseStatus === 'accepted'
        ? (confirmation.sent
            ? 'Invitation accepted. A secure Request Emergency Access link has been emailed to you. This does not give access to any vault items yet.'
            : 'Invitation accepted. Your secure Request Emergency Access link is ready on this page. This does not give access to any vault items yet.')
        : 'Invitation declined. No access has been granted.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Invitation response could not be saved.', error: error.message, details: error.details || null });
  }
}
