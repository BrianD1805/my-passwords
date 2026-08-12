import { APP_VERSION, jsonResponse, parseBody, requirePost, selectRows, updateRow } from './_db.js';
import { assertBrowserAction, consumeRateLimit, securityErrorResponseHeaders } from './_security.js';
import { verifyTrustedPersonReminderToken } from './_trusted-person-reminder-token.js';
import { recordEmergencyFlowEvent } from './_emergency-flow.js';
import { sendTemplatePushToUser } from './_push.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

export async function handler(event) {
  if (!requirePost(event)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  const body = parseBody(event);
  try { assertBrowserAction(event, { csrf: false }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }, securityErrorResponseHeaders(error)); }

  const token = String(body.token || '').trim();
  if (!token) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Trusted Person confirmation token is missing.' });

  try {
    await consumeRateLimit(event, { scope: 'trusted_person_reminder_confirm', identifier: token, limit: 10, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
    const payload = verifyTrustedPersonReminderToken(token);
    const rows = await selectRows('emergency_access_invitations', `select=id,tenant_id,user_id,status,contact_name,accepted_at,metadata&id=${eq(payload.invitationId)}&limit=1`);
    const invitation = rows?.[0];
    if (!invitation?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'This Trusted Person reminder is no longer available.' });
    if (String(invitation.status || '').toLowerCase() !== 'accepted') {
      return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'TRUSTED_PERSON_ROLE_INACTIVE', message: 'This Trusted Person nomination is no longer active.' });
    }

    const metadata = invitation.metadata && typeof invitation.metadata === 'object' ? invitation.metadata : {};
    const sentAt = metadata.trusted_person_reminder_sent_at || '';
    const sentAtMs = new Date(sentAt).getTime();
    if (!sentAt || !Number.isFinite(sentAtMs) || Math.abs(sentAtMs - Number(payload.iat)) > 1000) {
      return jsonResponse(410, { ok: false, version: APP_VERSION, code: 'REMINDER_SUPERSEDED', message: 'This is an older Trusted Person reminder. Please use the most recent reminder email.' });
    }

    if (metadata.trusted_person_reminder_confirmed_for_sent_at === sentAt && metadata.trusted_person_reminder_confirmed_at) {
      return jsonResponse(200, {
        ok: true, version: APP_VERSION, alreadyConfirmed: true,
        contactName: invitation.contact_name || '', ownerName: metadata.owner_name || 'the account owner',
        confirmedAt: metadata.trusted_person_reminder_confirmed_at,
        message: 'You already confirmed this Trusted Person reminder. No Emergency Access request has been started.'
      });
    }

    const now = new Date().toISOString();
    await updateRow('emergency_access_invitations', `id=${eq(invitation.id)}`, {
      metadata: {
        ...metadata,
        trusted_person_reminder_confirmed_at: now,
        trusted_person_reminder_confirmed_for_sent_at: sentAt,
        trusted_person_last_confirmed_at: now,
        version: APP_VERSION
      },
      updated_at: now
    });
    await recordEmergencyFlowEvent(invitation.id, {
      type: 'trusted_person_reminder_confirmed', title: 'Trusted Person reminder confirmed',
      message: 'The trusted person confirmed that they are still happy to remain the nominated trusted person.', occurredAt: now
    }).catch(() => null);

    await sendTemplatePushToUser({
      templateKey: 'trusted_person_reminder_confirmed',
      tenantId: invitation.tenant_id,
      userId: invitation.user_id,
      variables: { contactName: invitation.contact_name || 'Your trusted person' },
      urgency: 'normal',
      triggerSource: 'trusted_person_reminder_confirm',
      metadata: { invitation_id: invitation.id, confirmed_at: now }
    }).catch(() => null);

    return jsonResponse(200, {
      ok: true, version: APP_VERSION,
      contactName: invitation.contact_name || '', ownerName: metadata.owner_name || 'the account owner', confirmedAt: now,
      message: 'Thank you. Password-Encrypt has recorded that you are still happy to remain the trusted person. No Emergency Access request has been started.'
    });
  } catch (error) {
    return jsonResponse(error.status || 500, {
      ok: false, version: APP_VERSION, code: error.code || 'TRUSTED_PERSON_REMINDER_CONFIRM_FAILED',
      message: error.status ? error.message : 'Trusted Person confirmation could not be completed.'
    }, securityErrorResponseHeaders(error));
  }
}
