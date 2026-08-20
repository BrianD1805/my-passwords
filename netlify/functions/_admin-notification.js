import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 500) { return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function maskEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return '';
  const [name, domain] = email.split('@');
  return `${name.slice(0, Math.min(2, name.length))}***@${domain}`;
}
function normaliseFlags(value = {}) {
  return {
    new_client_onboarded: value.new_client_onboarded !== false,
    new_subscription_purchased: value.new_subscription_purchased !== false,
    trial_extension_requested: value.trial_extension_requested !== false,
    payment_failed: value.payment_failed !== false,
    subscription_cancelled: value.subscription_cancelled !== false,
    account_deletion_requested: value.account_deletion_requested !== false
  };
}

export const ADMIN_NOTIFICATION_DEFAULTS = {
  id: 'owner_admin',
  recipient_email: 'bdh1805@gmail.com',
  enabled: true,
  event_flags: normaliseFlags({})
};

export async function loadAdminNotificationSettings() {
  const rows = await selectRows('admin_notification_settings', `select=id,recipient_email,enabled,event_flags,created_at,updated_at&id=${eq('owner_admin')}&limit=1`).catch(() => []);
  const row = rows?.[0];
  if (!row?.id) return { ...ADMIN_NOTIFICATION_DEFAULTS, event_flags: { ...ADMIN_NOTIFICATION_DEFAULTS.event_flags }, missing: true };
  return {
    ...row,
    recipient_email: String(row.recipient_email || ADMIN_NOTIFICATION_DEFAULTS.recipient_email).trim().toLowerCase(),
    enabled: row.enabled !== false,
    event_flags: normaliseFlags(row.event_flags || {}),
    missing: false
  };
}

async function loadCustomerContext(tenantId, userId = '') {
  const [tenantRows, userRows, subscriptionRows] = await Promise.all([
    tenantId ? selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,trial_ends_at,created_at&id=${eq(tenantId)}&limit=1`).catch(() => []) : [],
    tenantId ? selectRows('users', userId
      ? `select=id,tenant_id,email,phone_e164,display_name,email_verified,phone_verified,created_at&id=${eq(userId)}&tenant_id=${eq(tenantId)}&limit=1`
      : `select=id,tenant_id,email,phone_e164,display_name,email_verified,phone_verified,first_tenant_owner,created_at&tenant_id=${eq(tenantId)}&order=first_tenant_owner.desc,created_at.asc&limit=5`).catch(() => []) : [],
    tenantId ? selectRows('tenant_subscriptions', `select=id,tenant_id,plan_code,status,billing_interval,currency,price_minor,current_period_end,provider,provider_subscription_id,trial_ends_at,created_at,updated_at&tenant_id=${eq(tenantId)}&limit=1`).catch(() => []) : []
  ]);
  const tenant = tenantRows?.[0] || null;
  const user = userRows?.[0] || null;
  const subscription = subscriptionRows?.[0] || null;
  const effectivePlanCode = subscription?.plan_code || tenant?.plan_code || '';
  const planRows = effectivePlanCode ? await selectRows('subscription_plans', `select=code,display_name&code=${eq(effectivePlanCode)}&limit=1`).catch(() => []) : [];
  const plan = planRows?.[0] || null;
  return { tenant, user, subscription, plan };
}

function friendlyInterval(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'annual') return 'Annual';
  if (key === 'quarterly') return 'Quarterly';
  if (key === 'monthly') return 'Monthly';
  return key ? key.replace(/_/g, ' ') : 'Not set';
}

function notificationDefinition(type, context = {}) {
  const name = escapeHtml(context.displayName || context.user?.display_name || 'Customer');
  const email = escapeHtml(context.email || context.user?.email || 'Not set');
  const phone = escapeHtml(context.phone || context.user?.phone_e164 || 'Not set');
  const account = escapeHtml(context.accountName || context.tenant?.account_name || context.tenant?.name || 'Password-Encrypt account');
  const plan = escapeHtml(context.planName || context.plan?.display_name || context.subscription?.plan_code || context.tenant?.plan_code || 'Not set');
  const frequency = escapeHtml(context.billingIntervalLabel || friendlyInterval(context.billingInterval || context.subscription?.billing_interval));
  const trialEnds = escapeHtml(context.trialEndsAt || context.tenant?.trial_ends_at || context.subscription?.trial_ends_at || 'Not set');
  const common = [
    ['Name', name], ['Email', email], ['Mobile', phone], ['Account', account]
  ];
  const definitions = {
    new_client_onboarded: {
      subject: 'Password-Encrypt: New client onboarded',
      heading: 'New client onboarded',
      intro: 'A new Password-Encrypt customer has completed onboarding.',
      fields: [...common, ['Plan', plan], ['Email verified', context.emailVerified ? 'Yes' : 'No'], ['Mobile verified', context.phoneVerified ? 'Yes' : 'No'], ['Verification method', escapeHtml(context.verificationMethod || 'Not recorded')]]
    },
    new_subscription_purchased: {
      subject: 'Password-Encrypt: New subscription purchased',
      heading: 'New subscription purchased',
      intro: 'A Password-Encrypt customer has activated a paid subscription.',
      fields: [...common, ['Plan', plan], ['Billing frequency', frequency]]
    },
    trial_extension_requested: {
      subject: 'Password-Encrypt: Trial extension requested',
      heading: 'Trial extension requested',
      intro: 'A customer has asked for more time on their Password-Encrypt trial.',
      fields: [...common, ['Plan', plan], ['Current trial end', trialEnds], ...(context.reason ? [['Customer note', escapeHtml(context.reason)]] : [])]
    },
    payment_failed: {
      subject: 'Password-Encrypt: Subscription payment failed',
      heading: 'Subscription payment failed',
      intro: 'A customer subscription payment needs attention.',
      fields: [...common, ['Plan', plan], ['Billing frequency', frequency]]
    },
    subscription_cancelled: {
      subject: 'Password-Encrypt: Subscription cancelled',
      heading: 'Subscription cancelled',
      intro: 'A customer subscription has been cancelled or reached its cancelled state.',
      fields: [...common, ['Plan', plan], ['Billing frequency', frequency], ['Current period end', escapeHtml(context.currentPeriodEnd || context.subscription?.current_period_end || 'Not set')]]
    },
    account_deletion_requested: {
      subject: 'Password-Encrypt: Account deletion requested',
      heading: 'Account deletion requested',
      intro: 'A customer has requested deletion of their Password-Encrypt account.',
      fields: [...common, ['Scheduled deletion', escapeHtml(context.scheduledFor || 'Not set')]]
    },
    admin_test: {
      subject: 'Password-Encrypt Admin notification test',
      heading: 'Admin notifications are working',
      intro: 'This is a safe test of Password-Encrypt owner/Admin automatic email notifications.',
      fields: [['Recipient', escapeHtml(context.recipient || '')], ['Version', escapeHtml(APP_VERSION)]]
    }
  };
  return definitions[type] || null;
}

export async function sendAdminNotification({ type, tenantId = '', userId = '', idempotencyKey, context = {}, bypassSettings = false }) {
  const settings = await loadAdminNotificationSettings();
  const recipient = String(settings.recipient_email || '').trim().toLowerCase();
  if (!recipient.includes('@')) return { sent: false, skipped: true, reason: 'recipient_not_configured' };
  if (!bypassSettings && (!settings.enabled || settings.event_flags?.[type] === false)) return { sent: false, skipped: true, reason: 'disabled' };

  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.OTP_EMAIL_FROM || '').trim();
  if (!apiKey || !from) return { sent: false, skipped: true, reason: 'resend_not_configured' };

  const customer = await loadCustomerContext(tenantId, userId);
  const merged = { ...customer, ...context, user: { ...(customer.user || {}), ...(context.user || {}) }, tenant: { ...(customer.tenant || {}), ...(context.tenant || {}) }, subscription: { ...(customer.subscription || {}), ...(context.subscription || {}) }, plan: { ...(customer.plan || {}), ...(context.plan || {}) } };
  const definition = notificationDefinition(type, { ...merged, recipient });
  if (!definition) return { sent: false, skipped: true, reason: 'unknown_type' };

  const key = safeText(idempotencyKey || `${type}:${tenantId || 'platform'}:${Date.now()}`, 240);
  let log;
  try {
    log = await insertRow('admin_notification_log', {
      id: publicId('adminnotify'), tenant_id: tenantId || null, user_id: userId || customer.user?.id || null,
      event_type: type, idempotency_key: key, recipient_masked: maskEmail(recipient), subject: definition.subject,
      provider: 'resend', provider_reference: null, status: 'pending', error_message: null,
      metadata: { version: APP_VERSION, source: safeText(context.source || 'automatic', 80) }, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
  } catch (error) {
    if (String(error?.details?.code || error?.code || '') === '23505' || /duplicate|unique/i.test(String(error.message || ''))) {
      return { sent: false, skipped: true, duplicate: true, reason: 'already_processed' };
    }
    return { sent: false, skipped: true, reason: 'notification_log_unavailable', error: error.message || '' };
  }

  const rows = definition.fields.map(([label, value]) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #e6edf3;color:#65758b;width:38%;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 10px;border-bottom:1px solid #e6edf3;color:#14263b;font-weight:600;vertical-align:top">${value}</td></tr>`).join('');
  const textFields = definition.fields.map(([label, value]) => `${label}: ${String(value).replace(/<[^>]+>/g, '')}`).join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:28px"><h1 style="margin:0 0 12px;color:#14263b;font-size:25px">${escapeHtml(definition.heading)}</h1><p style="margin:0 0 18px;line-height:1.6;color:#536579">${escapeHtml(definition.intro)}</p><table style="width:100%;border-collapse:collapse;border:1px solid #e6edf3;border-radius:12px;overflow:hidden">${rows}</table><p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#7b8fa3">Password-Encrypt Admin · ${escapeHtml(APP_VERSION)}<br>No vault contents or encryption secrets are included in this notification.</p></div></div></body></html>`;
  const text = `${definition.heading}\n\n${definition.intro}\n\n${textFields}\n\nPassword-Encrypt Admin · ${APP_VERSION}\nNo vault contents or encryption secrets are included in this notification.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'Idempotency-Key': key.slice(0, 256) },
      signal: controller.signal,
      body: JSON.stringify({ from, to: recipient, subject: definition.subject, html, text })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = safeText(data?.message || `Resend returned HTTP ${response.status}.`, 700);
      await updateRow('admin_notification_log', `id=${eq(log.id)}`, { status: 'failed', error_message: reason, updated_at: new Date().toISOString() }).catch(() => null);
      return { sent: false, skipped: false, reason };
    }
    const sentAt = new Date().toISOString();
    await updateRow('admin_notification_log', `id=${eq(log.id)}`, { status: 'sent', provider_reference: safeText(data?.id || '', 180) || null, sent_at: sentAt, error_message: null, updated_at: sentAt }).catch(() => null);
    return { sent: true, skipped: false, providerId: data?.id || '', recipientMasked: maskEmail(recipient) };
  } catch (error) {
    const reason = safeText(error?.name === 'AbortError' ? 'Admin notification delivery timed out.' : (error?.message || 'Admin notification delivery failed.'), 700);
    await updateRow('admin_notification_log', `id=${eq(log.id)}`, { status: 'failed', error_message: reason, updated_at: new Date().toISOString() }).catch(() => null);
    return { sent: false, skipped: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}
