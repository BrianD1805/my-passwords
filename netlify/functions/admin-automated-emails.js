import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateAdminSession } from './_admin-session.js';
import { assertBrowserAction } from './_security.js';
import { sendCustomerLifecycleEmail } from './_customer-email.js';
import { runCustomerLifecycleEmailProcessor } from './customer-lifecycle-email-process.js';
import { runEmergencyAccessReleaseProcessor } from './emergency-access-release-process.js';
import { ADMIN_NOTIFICATION_DEFAULTS, loadAdminNotificationSettings, sendAdminNotification } from './_admin-notification.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 500) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function parseJson(value) { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return {}; } }
function maskEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, Math.min(2, name.length))}***@${domain}`;
}

function deliveryState(row) {
  const raw = String(row?.status || '').toLowerCase();
  const attempts = Number(row?.attempts || 0);
  const retrying = (raw === 'failed' && attempts < 5) || (raw === 'sending' && attempts > 1);
  const status = raw === 'sent' ? 'sent' : raw === 'failed' ? 'failed' : 'pending';
  return { status, retrying, displayStatus: retrying ? 'retrying' : status };
}

async function audit(session, action, metadata = {}) {
  return insertRow('audit_log', {
    id: publicId('audit'), tenant_id: metadata.tenant_id || null, user_id: null, action,
    metadata: {
      version: APP_VERSION,
      actor: 'owner_admin',
      admin_session_issued_at: session?.iat ? new Date(Number(session.iat) * 1000).toISOString() : null,
      ...metadata
    }
  }).catch(() => null);
}

async function loadEmailAdminData() {
  const [logs, tenants, processorRuns, adminNotificationLogs, trialExtensionRequests] = await Promise.all([
    selectRows('customer_email_log', 'select=id,tenant_id,user_id,email_type,recipient_masked,subject,provider,status,attempts,error_message,last_attempt_at,sent_at,metadata,created_at,updated_at&order=created_at.desc&limit=2000'),
    selectRows('tenants', 'select=id,name,account_name&order=account_name.asc&limit=2000'),
    selectRows('email_processor_runs', 'select=id,processor_type,trigger_source,status,started_at,finished_at,items_checked,email_actions,result_summary,error_message,created_at&order=started_at.desc&limit=200'),
    selectRows('admin_notification_log', 'select=id,tenant_id,user_id,event_type,recipient_masked,subject,status,error_message,sent_at,created_at,updated_at&order=created_at.desc&limit=200').catch(() => []),
    selectRows('trial_extension_requests', 'select=id,tenant_id,user_id,status,reason,trial_ends_at,requested_at,reviewed_at,created_at&order=created_at.desc&limit=200').catch(() => [])
  ]);
  const adminNotificationSettings = await loadAdminNotificationSettings();
  const tenantMap = new Map((tenants || []).map((tenant) => [tenant.id, tenant.account_name || tenant.name || tenant.id]));
  const emailRows = (logs || []).map((row) => {
    const metadata = parseJson(row.metadata);
    const state = deliveryState(row);
    return {
      id: row.id,
      tenantId: row.tenant_id || '',
      customerName: row.tenant_id ? (tenantMap.get(row.tenant_id) || 'Customer account') : 'Admin test',
      emailType: row.email_type || '',
      recipientMasked: row.recipient_masked || '',
      subject: row.subject || '',
      status: state.status,
      displayStatus: state.displayStatus,
      retrying: state.retrying,
      rawStatus: row.status || '',
      attempts: Number(row.attempts || 0),
      errorMessage: row.error_message || '',
      lastAttemptAt: row.last_attempt_at || '',
      sentAt: row.sent_at || '',
      createdAt: row.created_at || '',
      source: metadata.source || metadata.retry_source || '',
      retryAvailable: Boolean(row.tenant_id && row.status === 'failed' && Number(row.attempts || 0) < 5)
    };
  });
  const summary = { sent: 0, failed: 0, pending: 0, retrying: 0 };
  for (const row of emailRows) {
    summary[row.status] = Number(summary[row.status] || 0) + 1;
    if (row.retrying) summary.retrying += 1;
  }
  const runs = (processorRuns || []).map((row) => ({
    id: row.id,
    processorType: row.processor_type,
    triggerSource: row.trigger_source,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    itemsChecked: Number(row.items_checked || 0),
    emailActions: Number(row.email_actions || 0),
    resultSummary: parseJson(row.result_summary),
    errorMessage: row.error_message || ''
  }));
  const lastLifecycleSuccess = runs.find((row) => row.processorType === 'customer_lifecycle' && row.status === 'success') || null;
  const lastEmergencySuccess = runs.find((row) => row.processorType === 'emergency_access_release' && row.status === 'success') || null;
  const emailTypes = [...new Set(emailRows.map((row) => row.emailType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const customerOptions = (tenants || []).map((tenant) => ({ value: tenant.id, label: tenant.account_name || tenant.name || tenant.id }));
  const adminNotificationRows = (adminNotificationLogs || []).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id || '',
    customerName: row.tenant_id ? (tenantMap.get(row.tenant_id) || 'Customer account') : 'Platform',
    eventType: row.event_type || '',
    recipientMasked: row.recipient_masked || '',
    subject: row.subject || '',
    status: row.status || '',
    errorMessage: row.error_message || '',
    sentAt: row.sent_at || '',
    createdAt: row.created_at || ''
  }));
  const pendingTrialRequests = (trialExtensionRequests || []).filter((row) => row.status === 'pending').length;
  return {
    emailRows,
    processorRuns: runs,
    summary,
    lastLifecycleSuccess,
    lastEmergencySuccess,
    emailTypes,
    customerOptions,
    adminNotifications: {
      configured: !adminNotificationSettings.missing,
      recipientEmail: adminNotificationSettings.recipient_email || ADMIN_NOTIFICATION_DEFAULTS.recipient_email,
      enabled: adminNotificationSettings.enabled !== false,
      eventFlags: adminNotificationSettings.event_flags || ADMIN_NOTIFICATION_DEFAULTS.event_flags,
      recentLogs: adminNotificationRows,
      pendingTrialRequests,
      eventOptions: [
        { key: 'new_client_onboarded', label: 'New client onboarded', description: 'Name, email, mobile number, plan and verification status.' },
        { key: 'new_subscription_purchased', label: 'New subscription purchased', description: 'Customer details, plan and billing frequency.' },
        { key: 'trial_extension_requested', label: 'Trial extension requested', description: 'Customer details, plan and current trial end date.' },
        { key: 'payment_failed', label: 'Payment failed', description: 'Important billing issue requiring attention.' },
        { key: 'subscription_cancelled', label: 'Subscription cancelled', description: 'Commercial/account retention notification.' },
        { key: 'account_deletion_requested', label: 'Account deletion requested', description: 'Customer deletion request and scheduled deletion date.' }
      ]
    },
    resendConfigured: Boolean(process.env.RESEND_API_KEY && process.env.OTP_EMAIL_FROM),
    schedules: {
      lifecycle: { label: 'Customer lifecycle', schedule: 'Hourly', cron: '0 * * * *' },
      emergency: { label: 'Emergency Access release', schedule: 'Every 5 minutes', cron: '*/5 * * * *' }
    }
  };
}

async function sendSafeTestEmail(to) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) throw Object.assign(new Error('Resend email delivery is not configured in Netlify.'), { status: 503 });
  const recipient = String(to || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw Object.assign(new Error('Enter a valid test email address.'), { status: 400 });
  const now = new Date().toISOString();
  const idempotencyKey = `admin_test_email:${Date.now()}:${crypto.randomUUID()}`;
  const log = await insertRow('customer_email_log', {
    id: publicId('customer_email'), tenant_id: null, user_id: null, email_type: 'admin_test_email', idempotency_key: idempotencyKey,
    recipient_masked: maskEmail(recipient), subject: 'Password-Encrypt automated email test', provider: 'resend', provider_reference: null,
    status: 'sending', attempts: 1, error_message: null, last_attempt_at: now, sent_at: null,
    metadata: { source: 'admin_safe_test', version: APP_VERSION }, created_at: now, updated_at: now
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'Idempotency-Key': idempotencyKey.slice(0, 256) },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: recipient,
        subject: 'Password-Encrypt automated email test',
        html: '<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:28px"><h1 style="margin:0 0 16px;color:#14263b;font-size:26px">Automated email test</h1><p style="margin:0 0 14px;line-height:1.62;color:#536579">This test confirms that Password-Encrypt can send customer emails through the configured email service.</p><p style="margin:0;line-height:1.62;color:#536579">No customer lifecycle status, subscription, trial, account setting or vault data was changed by this test.</p><p style="margin-top:24px;font-size:13px;color:#7b8fa3">Password-Encrypt · Support: info@zippyweb.uk</p></div></div></body></html>',
        text: 'Automated email test\n\nThis test confirms that Password-Encrypt can send customer emails through the configured email service.\n\nNo customer lifecycle status, subscription, trial, account setting or vault data was changed by this test.\n\nSupport: info@zippyweb.uk'
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data?.message || `Email provider returned HTTP ${response.status}.`;
      await updateRow('customer_email_log', `id=${eq(log.id)}`, { status: 'failed', error_message: String(reason).slice(0, 800), updated_at: new Date().toISOString() }).catch(() => null);
      return { sent: false, reason };
    }
    const sentAt = new Date().toISOString();
    await updateRow('customer_email_log', `id=${eq(log.id)}`, { status: 'sent', provider_reference: data?.id || null, sent_at: sentAt, error_message: null, updated_at: sentAt });
    return { sent: true, providerId: data?.id || '' };
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'Test email delivery timed out.' : (error.message || 'Test email delivery failed.');
    await updateRow('customer_email_log', `id=${eq(log.id)}`, { status: 'failed', error_message: String(reason).slice(0, 800), updated_at: new Date().toISOString() }).catch(() => null);
    return { sent: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

export async function handler(event) {
  const validation = await validateAdminSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'ADMIN_SESSION_REQUIRED', message: 'Admin sign-in is required.' });
  const session = validation.session;
  if (event.httpMethod === 'GET') {
    try {
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await loadEmailAdminData()) });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load automated email operations. Run all required Supabase migrations through Ver-1.009 first.', error: error.message, details: error.details || null });
    }
  }
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });

  const body = parseBody(event);
  const action = safeText(body.action, 80);
  try {
    assertBrowserAction(event, { session, kind: 'admin', csrf: true });
    if (action === 'run_lifecycle_processor') {
      await audit(session, 'admin_email_lifecycle_processor_started', { message: 'Manual lifecycle email check started.' });
      const result = await runCustomerLifecycleEmailProcessor({ triggerSource: 'admin' });
      await audit(session, 'admin_email_lifecycle_processor_completed', { email_actions: result.emailActions, sent: result.sent, skipped: result.skipped, failed: result.failed, message: 'Manual lifecycle email check completed.' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, result, message: `Lifecycle email check completed. ${result.sent || 0} sent, ${result.failed || 0} failed, ${result.skipped || 0} already handled.` });
    }

    if (action === 'run_emergency_processor') {
      await audit(session, 'admin_email_emergency_processor_started', { message: 'Manual Emergency Access release check started.' });
      const result = await runEmergencyAccessReleaseProcessor({ triggerSource: 'admin' });
      await audit(session, 'admin_email_emergency_processor_completed', { email_actions: result.processed, sent: result.sent, failed: result.failed, message: 'Manual Emergency Access release check completed.' });
      return jsonResponse(200, { ok: true, version: APP_VERSION, result, message: `Emergency Access release check completed. ${result.processed || 0} due request(s) processed.` });
    }

    if (action === 'save_admin_notifications') {
      const recipientEmail = safeText(body.recipientEmail, 320).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter a valid Admin notification email address.' });
      const allowedKeys = Object.keys(ADMIN_NOTIFICATION_DEFAULTS.event_flags);
      const incomingFlags = body.eventFlags && typeof body.eventFlags === 'object' ? body.eventFlags : {};
      const eventFlags = Object.fromEntries(allowedKeys.map((key) => [key, incomingFlags[key] !== false]));
      const now = new Date().toISOString();
      const existing = await selectRows('admin_notification_settings', `select=id&id=${eq('owner_admin')}&limit=1`).catch(() => []);
      if (existing?.[0]?.id) {
        await updateRow('admin_notification_settings', `id=${eq('owner_admin')}`, { recipient_email: recipientEmail, enabled: body.enabled !== false, event_flags: eventFlags, updated_at: now });
      } else {
        await insertRow('admin_notification_settings', { id: 'owner_admin', recipient_email: recipientEmail, enabled: body.enabled !== false, event_flags: eventFlags, created_at: now, updated_at: now });
      }
      await audit(session, 'admin_notification_settings_updated', { recipient_masked: maskEmail(recipientEmail), enabled: body.enabled !== false, event_flags: eventFlags });
      return jsonResponse(200, { ok: true, version: APP_VERSION, message: 'Admin notification settings saved.' });
    }

    if (action === 'send_admin_notification_test') {
      const settings = await loadAdminNotificationSettings();
      const delivery = await sendAdminNotification({ type: 'admin_test', idempotencyKey: `admin_notification_test:${Date.now()}:${crypto.randomUUID()}`, bypassSettings: true, context: { source: 'admin_test', recipient: settings.recipient_email } });
      await audit(session, delivery.sent ? 'admin_notification_test_sent' : 'admin_notification_test_failed', { recipient_masked: maskEmail(settings.recipient_email), message: delivery.sent ? 'Admin notification test sent.' : (delivery.reason || 'Admin notification test failed.') });
      return jsonResponse(delivery.sent ? 200 : 502, { ok: Boolean(delivery.sent), version: APP_VERSION, delivery, message: delivery.sent ? `Admin notification test sent to ${maskEmail(settings.recipient_email)}.` : (delivery.reason || 'Admin notification test failed.') });
    }

    if (action === 'retry_email') {
      const emailId = safeText(body.emailId, 160);
      const rows = emailId ? await selectRows('customer_email_log', `select=*&id=${eq(emailId)}&limit=1`) : [];
      const row = rows?.[0] || null;
      if (!row?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'The email delivery record was not found.' });
      if (!row.tenant_id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Admin test emails are sent as new tests rather than retried.' });
      if (row.status === 'sent') return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'This email has already been sent successfully.' });
      if (Number(row.attempts || 0) >= 5) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The automatic retry limit has been reached for this email.' });
      const metadata = parseJson(row.metadata);
      const delivery = await sendCustomerLifecycleEmail({
        tenantId: row.tenant_id,
        userId: row.user_id || '',
        type: row.email_type,
        idempotencyKey: row.idempotency_key,
        context: metadata.template_context || {},
        metadata: { ...metadata, retry_source: 'admin_automated_emails' }
      });
      await audit(session, delivery.sent ? 'admin_email_retry_sent' : 'admin_email_retry_failed', { tenant_id: row.tenant_id, email_type: row.email_type, email_id: row.id, message: delivery.sent ? 'Failed customer email retried successfully.' : (delivery.reason || 'Customer email retry did not send.') });
      return jsonResponse(delivery.sent ? 200 : 409, { ok: Boolean(delivery.sent), version: APP_VERSION, delivery, message: delivery.sent ? 'Email retry sent successfully.' : (delivery.reason || 'Email retry did not send.') });
    }

    if (action === 'send_test_email') {
      const recipient = safeText(body.email, 320).toLowerCase();
      const delivery = await sendSafeTestEmail(recipient);
      await audit(session, delivery.sent ? 'admin_email_test_sent' : 'admin_email_test_failed', { recipient_masked: maskEmail(recipient), message: delivery.sent ? 'Safe Resend test email sent.' : (delivery.reason || 'Safe test email failed.') });
      return jsonResponse(delivery.sent ? 200 : 502, { ok: Boolean(delivery.sent), version: APP_VERSION, delivery, message: delivery.sent ? `Test email sent to ${maskEmail(recipient)}. No customer lifecycle data was changed.` : (delivery.reason || 'Test email failed.') });
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown automated email Admin action.' });
  } catch (error) {
    await audit(session, 'admin_email_action_failed', { action, error: String(error.message || 'Admin automated email action failed.').slice(0, 500) });
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, message: error.message || 'Automated email action failed.', details: error.details || null });
  }
}
