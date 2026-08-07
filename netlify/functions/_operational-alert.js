import { sanitiseOperationalText } from './_operations.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
}

export async function sendOperationalAlert({ subject, heading, message, idempotencyKey }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.OTP_EMAIL_FROM || '').trim();
  const to = String(process.env.OPS_ALERT_EMAIL || '').trim();
  if (!apiKey || !from || !to.includes('@')) return { sent: false, skipped: true, reason: 'not_configured' };

  const safeSubject = sanitiseOperationalText(subject || 'Password-Encrypt operational alert', 140);
  const safeHeading = sanitiseOperationalText(heading || 'Operational alert', 160);
  const safeMessage = sanitiseOperationalText(message || 'Password-Encrypt requires operational attention.', 500);
  const text = `${safeHeading}\n\n${safeMessage}\n\nOpen Password-Encrypt Admin > Health for the metadata-only diagnostic view.`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:26px"><h1 style="margin:0 0 12px;color:#14263b;font-size:24px">${escapeHtml(safeHeading)}</h1><p style="margin:0 0 18px;line-height:1.6;color:#536579">${escapeHtml(safeMessage)}</p><p style="margin:0;font-size:13px;line-height:1.5;color:#7b8fa3">Open Password-Encrypt Admin &gt; Health for the metadata-only diagnostic view. No vault contents are included in this alert.</p></div></div></body></html>`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'Idempotency-Key': String(idempotencyKey || 'my-passwords-operational-alert').slice(0, 256)
      },
      signal: controller.signal,
      body: JSON.stringify({ from, to, subject: safeSubject, html, text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, skipped: false, status: response.status, errorCode: sanitiseOperationalText(data?.name || data?.statusCode || `HTTP_${response.status}`, 100) };
    return { sent: true, providerId: sanitiseOperationalText(data?.id || '', 160) };
  } catch (error) {
    return { sent: false, skipped: false, status: 0, errorCode: error?.name || 'OPERATIONAL_ALERT_FAILED' };
  } finally {
    clearTimeout(timeout);
  }
}
