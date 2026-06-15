import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows, updateRow } from './_db.js';
import { createHash } from 'node:crypto';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function tokenHash(token) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-emergency-invite';
  return createHash('sha256').update(`${token}:${secret}`).digest('hex');
}

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, message: 'POST required.' });
  const body = parseBody(event);
  const token = String(body.token || '').trim();
  const responseStatus = String(body.response || '').trim() === 'declined' ? 'declined' : 'accepted';
  if (!token) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Invitation token is missing.' });

  try {
    const rows = await selectRows('emergency_access_invitations', `select=id,status,expires_at&invite_token_hash=${eq(tokenHash(token))}&limit=1`);
    const invitation = rows?.[0];
    if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This invitation link was not found or has expired.' });
    if (invitation.status === 'cancelled') return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This invitation has been cancelled by the account owner.' });
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) return jsonResponse(410, { ok: false, version: APP_VERSION, message: 'This invitation has expired. Please ask the account owner to send a new one.' });

    const now = new Date().toISOString();
    await updateRow('emergency_access_invitations', `id=${eq(invitation.id)}`, {
      status: responseStatus,
      accepted_at: responseStatus === 'accepted' ? now : null,
      declined_at: responseStatus === 'declined' ? now : null,
      updated_at: now
    });

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      status: responseStatus,
      message: responseStatus === 'accepted'
        ? 'Invitation accepted. This does not give access to any vault items yet.'
        : 'Invitation declined. No access has been granted.'
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Invitation response could not be saved.', error: error.message, details: error.details || null });
  }
}
