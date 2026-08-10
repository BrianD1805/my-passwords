import { APP_VERSION, selectRows, updateRow } from './_db.js';
import { createTrustedPersonReminderToken } from './_trusted-person-reminder-token.js';
import { recordEmergencyFlowEvent } from './_emergency-flow.js';
import { finishScheduledCheck, recordFunctionFailure, recordOperationalEvent, resolveOperationalEventsByType, startScheduledCheck } from './_operations.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function addCalendarMonths(value, months) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

function siteBaseUrl(invitation) {
  const metadata = invitation?.metadata || {};
  for (const candidate of [invitation?.invite_url, metadata.request_access_url, process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL]) {
    try { if (candidate) return new URL(candidate).origin; } catch { /* ignore */ }
  }
  return process.env.CONTEXT === 'production' ? '' : 'http://localhost:8888';
}

function buildReminderEmail({ contactName, ownerName, ownerEmail, ownerPhone, confirmationUrl }) {
  const safeContactText = String(contactName || 'there').trim() || 'there';
  const safeOwnerText = String(ownerName || 'the account owner').trim() || 'the account owner';
  const safeOwnerEmailText = String(ownerEmail || '').trim();
  const safeOwnerPhoneText = String(ownerPhone || '').trim();
  const safeContact = escapeHtml(safeContactText);
  const safeOwner = escapeHtml(safeOwnerText);
  const safeOwnerEmail = escapeHtml(safeOwnerEmailText);
  const safeOwnerPhone = escapeHtml(safeOwnerPhoneText);
  const safeUrl = escapeHtml(confirmationUrl || '');
  const contactLines = [safeOwnerEmailText ? `Email: ${safeOwnerEmailText}` : '', safeOwnerPhoneText ? `Phone: ${safeOwnerPhoneText}` : ''].filter(Boolean).join(' · ');
  const htmlContacts = [safeOwnerEmail ? `<p style="margin:5px 0 0"><strong>Email:</strong> ${safeOwnerEmail}</p>` : '', safeOwnerPhone ? `<p style="margin:5px 0 0"><strong>Phone:</strong> ${safeOwnerPhone}</p>` : ''].join('');
  const text = `Hello ${safeContactText}. This is your three-month Password-Encrypt Trusted Person reminder. ${safeOwnerText} still has you nominated as their trusted person for serious illness, incapacity or another emergency. ${contactLines ? `${contactLines}. ` : ''}This reminder does not start Emergency Access and does not give you access to any vault information. If you are still happy to remain their trusted person, open this secure confirmation page and confirm: ${confirmationUrl}. Keep your original “Password-Encrypt Emergency Access — Keep this link safe” email somewhere safe; this reminder does not replace that emergency link. If you no longer wish to be the trusted person or your contact details have changed, contact ${safeOwnerText} directly. Support: info@zippyweb.uk.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">A reminder about your Trusted Person role</h1><p style="margin:0 0 16px;line-height:1.6;color:#536579">Hello ${safeContact}, this is your routine three-month reminder that <strong>${safeOwner}</strong> still has you nominated as their trusted person for Password-Encrypt.</p><div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:0 0 18px"><strong>The person who nominated you</strong><p style="margin:8px 0 0"><strong>Name:</strong> ${safeOwner}</p>${htmlContacts}</div><p style="margin:0 0 16px;line-height:1.6;color:#536579"><strong>This reminder does not start Emergency Access and does not reveal any vault information.</strong></p><p style="margin:0 0 18px;line-height:1.6;color:#536579">If you are still happy to remain their trusted person, use the button below. For safety, the button opens Password-Encrypt first and asks you to confirm once more, so automated email scanners cannot confirm on your behalf.</p>${safeUrl ? `<a href="${safeUrl}" style="display:inline-block;background:#336699;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">Yes, I’m still the trusted person</a>` : ''}<div style="background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;padding:16px;margin:20px 0 0"><strong>Keep your Emergency Access email safe</strong><p style="margin:8px 0 0;line-height:1.55;color:#536579">Keep the original email titled <strong>Password-Encrypt Emergency Access — Keep this link safe</strong>. That email contains the secure link you would use only if Emergency Access is genuinely needed in the future. This reminder does not replace it.</p></div><p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#7b8fa3">If you no longer wish to be the trusted person or your contact details have changed, contact ${safeOwner} directly. If you need help with Password-Encrypt, contact info@zippyweb.uk.</p></div></div></body></html>`;
  return { subject: 'Password-Encrypt Trusted Person reminder — Please confirm', html, text };
}

async function sendReminderEmail({ invitation, confirmationUrl }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  const to = String(invitation?.contact_email || '').trim();
  if (!apiKey || !from || !to || !to.includes('@')) return { sent: false, reason: 'Trusted Person reminder email is not configured.' };
  const metadata = invitation.metadata || {};
  const content = buildReminderEmail({
    contactName: invitation.contact_name,
    ownerName: metadata.owner_name || 'the account owner',
    ownerEmail: metadata.owner_email || '',
    ownerPhone: metadata.owner_phone || '',
    confirmationUrl
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ from, to, subject: content.subject, html: content.html, text: content.text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, reason: data?.message || `Resend returned HTTP ${response.status}.` };
    return { sent: true, providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, reason: error.name === 'AbortError' ? 'Trusted Person reminder email timed out.' : (error.message || 'Trusted Person reminder email could not be sent.') };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runTrustedPersonReminderProcess({ triggerSource = 'scheduled' } = {}) {
  const run = await startScheduledCheck('trusted_person_quarterly_reminders', triggerSource);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  let checked = 0;
  let sent = 0;
  let skippedActiveEmergency = 0;
  let failed = 0;
  try {
    const invitations = await selectRows('emergency_access_invitations', 'select=id,tenant_id,user_id,status,accepted_at,contact_name,contact_email,invite_url,metadata,updated_at&status=eq.accepted&order=accepted_at.asc&limit=500');
    for (const invitation of invitations || []) {
      checked += 1;
      const metadata = invitation.metadata && typeof invitation.metadata === 'object' ? invitation.metadata : {};
      const anchor = metadata.trusted_person_reminder_sent_at || invitation.accepted_at || invitation.updated_at;
      const dueAt = addCalendarMonths(anchor, 3);
      if (!dueAt || dueAt.getTime() > nowMs) continue;

      const activeRequests = await selectRows('emergency_access_requests', `select=id,status&invitation_id=${eq(invitation.id)}&status=in.(requested,waiting,owner_notified,release_ready)&cancelled_at=is.null&limit=1`).catch(() => []);
      if (activeRequests?.length) {
        skippedActiveEmergency += 1;
        continue;
      }

      const { token, payload } = createTrustedPersonReminderToken(invitation.id, nowMs);
      const base = siteBaseUrl(invitation);
      if (!base) throw new Error('The public Password-Encrypt site URL is not configured for Trusted Person reminders.');
      const confirmationUrl = `${base}/trusted-person-confirm?token=${encodeURIComponent(token)}`;
      const delivery = await sendReminderEmail({ invitation, confirmationUrl });
      if (!delivery.sent) {
        failed += 1;
        await recordOperationalEvent({
          source: 'trusted_person_reminder_process', eventType: 'trusted_person_reminder_delivery_failed', severity: 'warning', errorCode: 'TRUSTED_PERSON_REMINDER_EMAIL_FAILED',
          message: 'A scheduled Trusted Person reminder email could not be delivered.', tenantId: invitation.tenant_id || null,
          metadata: { invitationId: invitation.id }
        });
        continue;
      }

      const nextDueAt = addCalendarMonths(now, 3)?.toISOString() || null;
      await updateRow('emergency_access_invitations', `id=${eq(invitation.id)}`, {
        email_provider: 'resend',
        email_provider_id: delivery.providerId || '',
        metadata: {
          ...metadata,
          trusted_person_reminder_sent_at: now,
          trusted_person_reminder_next_due_at: nextDueAt,
          trusted_person_reminder_confirmation_expires_at: new Date(Number(payload.exp)).toISOString(),
          trusted_person_reminder_provider_id: delivery.providerId || '',
          trusted_person_reminder_confirmed_at: null,
          trusted_person_reminder_confirmed_for_sent_at: null,
          version: APP_VERSION
        },
        updated_at: now
      });
      await recordEmergencyFlowEvent(invitation.id, {
        type: 'trusted_person_reminder_sent', title: 'Trusted Person reminder sent',
        message: 'The quarterly reminder was emailed to the trusted person with a secure confirmation option.', occurredAt: now
      }).catch(() => null);
      sent += 1;
    }

    if (!failed) await resolveOperationalEventsByType('trusted_person_reminder_process', 'trusted_person_reminder_delivery_failed');
    await finishScheduledCheck(run, {
      status: failed ? 'warning' : 'success', itemsChecked: checked, issuesFound: failed,
      summary: { remindersSent: sent, skippedActiveEmergency, deliveryFailures: failed }
    });
    return { ok: true, version: APP_VERSION, checkedAt: now, invitationsChecked: checked, remindersSent: sent, skippedActiveEmergency, deliveryFailures: failed };
  } catch (error) {
    await finishScheduledCheck(run, { status: 'failed', errorCode: error?.code || 'TRUSTED_PERSON_REMINDER_PROCESS_FAILED', errorMessage: error?.message || 'Trusted Person reminder process failed.' });
    await recordFunctionFailure('trusted-person-reminder-process', error, { triggerSource });
    throw error;
  }
}

export async function handler() {
  try {
    const result = await runTrustedPersonReminderProcess({ triggerSource: 'scheduled' });
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, version: APP_VERSION, message: 'Trusted Person reminder process failed.' }) };
  }
}
