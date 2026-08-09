import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows, updateRow } from './_db.js';
import { createHash } from 'node:crypto';
import { resolveTenantEntitlements } from './_entitlements.js';
import { assertBrowserAction, consumeRateLimit, securityErrorResponseHeaders } from './_security.js';
import { recordEmergencyFlowEvent } from './_emergency-flow.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function tokenHash(token) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite';
  return createHash('sha256').update(`${token}:${secret}`).digest('hex');
}

function firstName(name) {
  return String(name || 'the account owner').trim().split(/\s+/)[0] || 'the account owner';
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

function buildAcceptedEmail({ ownerName, contactName, waitingPeriod, accessScope, requestUrl }) {
  const safeOwner = ownerName || 'The account owner';
  const ownerFirst = firstName(safeOwner);
  const safeContact = contactName || 'there';
  const text = `Hello ${safeContact}. Stage 2 is complete: you accepted ${safeOwner}'s Password-Encrypt trusted person nomination. Keep this email safe. Nothing from the vault has been released. If a genuine emergency happens, use this secure Request Access link: ${requestUrl}. Requesting access starts the ${waitingPeriod || '7 days'} waiting period and immediately notifies ${safeOwner}. ${safeOwner} can cancel during that waiting period. Only if the waiting period ends without cancellation will the prepared ${accessScope || 'Emergency Info folder only'} package become available. You will then receive a final email telling you the package is ready.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:560px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #d7e2ec;border-radius:22px;padding:26px;box-shadow:0 14px 38px rgba(29,53,87,0.12);">
        <h1 style="margin:0 0 10px;color:#14263b;font-size:24px;">Stage 2 complete — nomination accepted</h1>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Hello ${safeContact}, you have accepted ${safeOwner}'s Password-Encrypt trusted person nomination.</p>
        <p style="margin:0 0 18px;line-height:1.55;color:#536579;">Keep this email somewhere safe. Nothing from the vault has been released. Use the secure browser link below only if a genuine emergency means you need to request access.</p>
        <div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px;">
          <p style="margin:0 0 8px;"><strong>Waiting period:</strong> ${waitingPeriod || '7 days'}</p>
          <p style="margin:0;"><strong>Planned access scope:</strong> ${accessScope || 'Emergency Info folder only'}</p>
        </div>
        <a href="${requestUrl}" style="display:inline-block;background:#1d3557;color:#ffffff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700;">Request access for ${ownerFirst}</a>
        <p style="margin:18px 0 0;font-size:13px;line-height:1.45;color:#7b8fa3;">Next stage: requesting access starts the waiting period and immediately notifies ${safeOwner}. ${safeOwner} can cancel before the period ends. Only after the period ends without cancellation will the prepared package become available, and you will receive a final email.</p>
      </div>
    </div>
  </body>
</html>`;
  return { html, text, subject: `Stage 2: Trusted person nomination accepted for ${ownerFirst}` };
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
        subject: content.subject || 'Your Password-Encrypt link',
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
  try { assertBrowserAction(event, { csrf: false }); } catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }
  const token = String(body.token || '').trim();
  const responseStatus = String(body.response || '').trim() === 'declined' ? 'declined' : 'accepted';
  if (!token) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation token is missing.' });

  try {
    await consumeRateLimit(event, { scope: 'emergency_invite_response', identifier: tokenHash(token), limit: 10, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    const rows = await selectRows('emergency_access_invitations', `select=id,tenant_id,status,expires_at,contact_name,contact_email,invite_url,waiting_period,access_scope,metadata&invite_token_hash=${eq(tokenHash(token))}&limit=1`);
    const invitation = rows?.[0];
    if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This invitation link was not found or has expired.' });
    const entitlementContext = await resolveTenantEntitlements(invitation.tenant_id, { includeUsage: false });
    if (entitlementContext.effective.features.emergencyAccess === false) {
      return jsonResponse(403, { ok: false, version: APP_VERSION, code: 'PLAN_FEATURE_REQUIRED', feature: 'emergencyAccess', message: 'Emergency Access is not currently available for this account.' });
    }
    if (invitation.status === 'cancelled') return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This invitation has been cancelled by the account owner.' });
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This invitation has expired. Please ask the account owner to send a new one.' });

    const now = new Date().toISOString();
    const requestUrl = invitation.metadata?.request_access_url || withEmergencyStep(invitation.invite_url || '', 'request');
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

    await recordEmergencyFlowEvent(invitation.id, {
      type: responseStatus === 'accepted' ? 'invitation_accepted' : 'invitation_declined',
      title: responseStatus === 'accepted' ? 'Invitation accepted' : 'Invitation declined',
      message: responseStatus === 'accepted' ? 'The trusted person accepted the nomination. No vault contents were released.' : 'The trusted person declined the nomination. No access was granted.',
      occurredAt: now
    }).catch(() => null);

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
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, code: error.code || 'EMERGENCY_RESPONSE_FAILED', message: error.status ? error.message : 'Invitation response could not be saved.', error: error.status ? undefined : error.message, details: error.details || null }, securityErrorResponseHeaders(error));
  }
}
