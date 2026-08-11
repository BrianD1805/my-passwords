import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';
import { recordOperationalEvent } from './_operations.js';

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function maskEmail(value) {
  const email = String(value || '').trim();
  if (!email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const visible = name.length <= 1 ? name.slice(0, 1) : name.slice(0, 2);
  return `${visible}***@${domain}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC'
  }).format(date)} UTC`;
}

function formatMoney(amountMinor, currency = 'GBP') {
  const amount = Number(amountMinor);
  if (!Number.isFinite(amount)) return '';
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: String(currency || 'GBP').toUpperCase()
    }).format(amount / 100);
  } catch {
    return `${String(currency || 'GBP').toUpperCase()} ${(amount / 100).toFixed(2)}`;
  }
}

function baseUrl() {
  const raw = String(process.env.URL || 'https://password-encrypt.com').replace(/\/$/, '');
  return /^https?:\/\//i.test(raw) ? raw : 'https://password-encrypt.com';
}

function emailDefinition(type, context = {}) {
  const displayName = escapeHtml(context.displayName || 'there');
  const accountName = escapeHtml(context.accountName || 'your Password-Encrypt account');
  const planName = escapeHtml(context.planName || context.planCode || 'your current plan');
  const previousPlanName = escapeHtml(context.previousPlanName || context.previousPlanCode || 'your previous plan');
  const trialEnd = formatDate(context.trialEndsAt);
  const renewalDate = formatDate(context.renewalAt || context.currentPeriodEnd);
  const cancellationDate = formatDate(context.cancellationAt || context.currentPeriodEnd);
  const graceEnd = formatDate(context.gracePeriodEndsAt);
  const deletionDate = formatDate(context.deletionScheduledFor);
  const changedAt = formatDateTime(context.changedAt);
  const verifiedAt = formatDateTime(context.verifiedAt);
  const amount = formatMoney(context.amountMinor, context.currency);
  const support = 'info@zippyweb.uk';
  const billingUrl = `${baseUrl()}/vault`;
  const accountEmail = escapeHtml(context.accountEmail || '');
  const accountPhone = escapeHtml(context.accountPhone || '');
  const definitions = {
    welcome_trial_started: {
      subject: 'Welcome to Password-Encrypt — your trial has started',
      heading: 'Welcome to Password-Encrypt',
      paragraphs: [
        `Hello ${displayName},`,
        `Your <strong>${accountName}</strong> account is ready and your ${planName} trial has started${trialEnd ? ` and will end on ${escapeHtml(trialEnd)}` : ''}.`,
        '<strong>Your Password-Encrypt account details</strong>',
        accountEmail ? `Login email: <strong>${accountEmail}</strong>` : '',
        accountPhone ? `Mobile number: <strong>${accountPhone}</strong>` : '',
        `Vault name: <strong>${accountName}</strong>`,
        `Plan: <strong>${planName}</strong>`,
        'Next, create your encrypted vault and choose the master password only you know. Your master password is never included in email and Password-Encrypt cannot recover it for you.',
        'Account verification currently uses your email address. Keep this welcome email as a record of the contact details linked to your account.',
        'No credit card details were taken for your free trial. A paid subscription begins only if you deliberately purchase a subscription later.'
      ].filter(Boolean),
      button: { label: 'Password-Encrypt website', url: baseUrl() }
    },
    welcome_account_activated: {
      subject: 'Welcome to Password-Encrypt',
      heading: 'Your account is ready',
      paragraphs: [
        `Hello ${displayName},`,
        `Your <strong>${accountName}</strong> account is active on the ${planName} plan.`,
        '<strong>Your Password-Encrypt account details</strong>',
        accountEmail ? `Login email: <strong>${accountEmail}</strong>` : '',
        accountPhone ? `Mobile number: <strong>${accountPhone}</strong>` : '',
        `Vault name: <strong>${accountName}</strong>`,
        `Plan: <strong>${planName}</strong>`,
        'Next, create your encrypted vault and choose the master password only you know. Your master password is never included in email and Password-Encrypt cannot recover it for you.',
        'Account verification currently uses your email address. Keep this welcome email as a record of the contact details linked to your account.'
      ].filter(Boolean),
      button: { label: 'Password-Encrypt website', url: baseUrl() }
    },
    trial_started: {
      subject: 'Your Password-Encrypt trial has started',
      heading: 'Your trial has started',
      paragraphs: [
        `Hello ${displayName},`,
        `Your ${planName} trial for <strong>${accountName}</strong> is now active${trialEnd ? ` until ${escapeHtml(trialEnd)}` : ''}.`,
        'Your included account features remain available throughout the trial.',
        'The trial does not automatically become a paid subscription unless you deliberately complete Stripe Checkout.'
      ],
      button: { label: 'Open Password-Encrypt', url: billingUrl }
    },
    trial_extended: {
      subject: 'Your Password-Encrypt trial has been extended',
      heading: 'Your trial has been extended',
      paragraphs: [
        `Hello ${displayName},`,
        `The trial for <strong>${accountName}</strong> has been extended${trialEnd ? ` until ${escapeHtml(trialEnd)}` : ''}.`,
        'Your current plan features remain available during the extended trial period.',
        'Your vault remains encrypted. The master password is the primary secret used to decrypt it; a device you deliberately set up may also use Secure device unlock.'
      ],
      button: { label: 'Open Password-Encrypt', url: billingUrl }
    },
    trial_ending_soon: {
      subject: 'Your Password-Encrypt trial is ending soon',
      heading: 'Your trial is ending soon',
      paragraphs: [
        `Hello ${displayName},`,
        `Your ${planName} trial for <strong>${accountName}</strong> ends${trialEnd ? ` on ${escapeHtml(trialEnd)}` : ' soon'}.`,
        'Choose a subscription before the trial ends if you want cloud account services to continue without interruption.',
        'Your encrypted local vault remains protected by your master password.'
      ],
      button: { label: 'Review Plan & Billing', url: billingUrl }
    },
    trial_expired: {
      subject: 'Your Password-Encrypt trial has ended',
      heading: 'Your trial has ended',
      paragraphs: [
        `Hello ${displayName},`,
        `The trial for <strong>${accountName}</strong> has ended.`,
        'Cloud backup, syncing and other subscription account services are paused until a plan is activated.',
        'Your encrypted local vault remains on your device and still requires your master password.'
      ],
      button: { label: 'Choose a Plan', url: billingUrl }
    },
    subscription_activated: {
      subject: 'Your Password-Encrypt subscription is active',
      heading: 'Subscription activated',
      paragraphs: [
        `Hello ${displayName},`,
        `Your ${planName} subscription for <strong>${accountName}</strong> is now active.`,
        renewalDate ? `Your current billing period runs until ${escapeHtml(renewalDate)}.` : 'Your subscription account services are available now.',
        'Thank you for choosing Password-Encrypt.'
      ],
      button: { label: 'Open Password-Encrypt', url: billingUrl }
    },
    upcoming_renewal: {
      subject: 'Your Password-Encrypt subscription renews soon',
      heading: 'Upcoming renewal',
      paragraphs: [
        `Hello ${displayName},`,
        `Your ${planName} subscription for <strong>${accountName}</strong> is due to renew${renewalDate ? ` on ${escapeHtml(renewalDate)}` : ' soon'}.`,
        amount ? `The expected renewal amount is ${escapeHtml(amount)}.` : 'You can review your upcoming billing information in Password-Encrypt.',
        'If you need to change your plan or payment method, please do so before the renewal date.'
      ],
      button: { label: 'Review Plan & Billing', url: billingUrl }
    },
    payment_failed: {
      subject: 'Your Password-Encrypt payment was unsuccessful',
      heading: 'Payment unsuccessful',
      paragraphs: [
        `Hello ${displayName},`,
        `We could not complete the latest payment for <strong>${accountName}</strong>.`,
        amount ? `The payment amount was ${escapeHtml(amount)}.` : 'Please review the payment method for your subscription.',
        'Update your billing details in Password-Encrypt so your subscription can continue normally.'
      ],
      button: { label: 'Review Plan & Billing', url: billingUrl }
    },
    payment_action_required: {
      subject: 'Action is required for your Password-Encrypt payment',
      heading: 'Payment action required',
      paragraphs: [
        `Hello ${displayName},`,
        `Your payment for <strong>${accountName}</strong> needs an additional confirmation before it can complete.`,
        'Open Plan & Billing and follow the payment instructions shown there.',
        'Your vault remains private and protected by your master password.'
      ],
      button: { label: 'Complete Payment', url: billingUrl }
    },
    grace_period_started: {
      subject: 'Your Password-Encrypt payment grace period has started',
      heading: 'Payment grace period started',
      paragraphs: [
        `Hello ${displayName},`,
        `A payment issue remains on <strong>${accountName}</strong>, so a temporary grace period has started${graceEnd ? ` until ${escapeHtml(graceEnd)}` : ''}.`,
        'Please update your payment details before the grace period ends to avoid interruption to subscription account services.',
        'Your encrypted local vault remains protected by your master password.'
      ],
      button: { label: 'Review Plan & Billing', url: billingUrl }
    },
    subscription_cancelled: {
      subject: 'Your Password-Encrypt subscription has ended',
      heading: 'Subscription cancelled',
      paragraphs: [
        `Hello ${displayName},`,
        `Your ${planName} subscription for <strong>${accountName}</strong> has ended.`,
        'Subscription account services are no longer active.',
        'Your encrypted local vault remains on your device and still requires your master password.'
      ],
      button: { label: 'Review Plans', url: billingUrl }
    },
    cancellation_scheduled: {
      subject: 'Your Password-Encrypt cancellation is scheduled',
      heading: 'Cancellation scheduled',
      paragraphs: [
        `Hello ${displayName},`,
        `Your ${planName} subscription for <strong>${accountName}</strong> is scheduled to end${cancellationDate ? ` on ${escapeHtml(cancellationDate)}` : ' at the end of the current billing period'}.`,
        'Your subscription remains active until that date.',
        'You can remove the scheduled cancellation from Plan & Billing before the subscription ends.'
      ],
      button: { label: 'Review Plan & Billing', url: billingUrl }
    },
    subscription_reactivated: {
      subject: 'Your Password-Encrypt subscription will continue',
      heading: 'Subscription reactivated',
      paragraphs: [
        `Hello ${displayName},`,
        `The scheduled cancellation for <strong>${accountName}</strong> has been removed.`,
        `Your ${planName} subscription will continue and renew normally.`,
        renewalDate ? `The current billing period ends on ${escapeHtml(renewalDate)}.` : 'Your subscription account services remain active.'
      ],
      button: { label: 'Open Password-Encrypt', url: billingUrl }
    },
    plan_changed: {
      subject: 'Your Password-Encrypt plan has changed',
      heading: 'Plan changed',
      paragraphs: [
        `Hello ${displayName},`,
        `The plan for <strong>${accountName}</strong> has changed from ${previousPlanName} to ${planName}.`,
        context.billingInterval ? `Your billing period is now ${escapeHtml(String(context.billingInterval).replace(/_/g, ' '))}.` : 'Your current plan features are available now.',
        'Open Plan & Billing to review your current subscription details.'
      ],
      button: { label: 'Review Plan & Billing', url: billingUrl }
    },
    email_changed: {
      subject: 'Your Password-Encrypt email address was changed',
      heading: 'Email address changed',
      paragraphs: [
        `Hello ${displayName},`,
        `The email address for <strong>${accountName}</strong> was changed${changedAt ? ` on ${escapeHtml(changedAt)}` : ''}.`,
        context.newEmailMasked ? `The account email is now ${escapeHtml(context.newEmailMasked)}.` : 'The new email address has been verified.',
        `If you did not make this change, contact ${support} immediately.`
      ]
    },
    mobile_changed: {
      subject: 'Your Password-Encrypt mobile number was changed',
      heading: 'Mobile number changed',
      paragraphs: [
        `Hello ${displayName},`,
        `The verified mobile number for <strong>${accountName}</strong> was changed${changedAt ? ` on ${escapeHtml(changedAt)}` : ''}.`,
        context.newPhoneMasked ? `The verified mobile number is now ${escapeHtml(context.newPhoneMasked)}.` : 'The new mobile number has been verified.',
        `If you did not make this change, contact ${support} immediately.`
      ]
    },
    new_device_verified: {
      subject: 'A new device was verified for Password-Encrypt',
      heading: 'New device verified',
      paragraphs: [
        `Hello ${displayName},`,
        `A new device was verified for <strong>${accountName}</strong>${verifiedAt ? ` on ${escapeHtml(verifiedAt)}` : ''}.`,
        context.deviceName ? `Device: ${escapeHtml(context.deviceName)}${context.platform ? ` · ${escapeHtml(context.platform)}` : ''}.` : 'The device can now use the account services available to your plan.',
        `If this was not you, open Password-Encrypt to remove the device and end account sessions, or contact ${support}.`
      ],
      button: { label: 'Review Devices', url: billingUrl }
    },
    account_suspended: {
      subject: 'Your Password-Encrypt account has been suspended',
      heading: 'Account suspended',
      paragraphs: [
        `Hello ${displayName},`,
        `<strong>${accountName}</strong> has been suspended.`,
        'Cloud account services may remain unavailable while the suspension is active.',
        `Your encrypted local vault remains protected by your master password. Contact ${support} if you need assistance.`
      ]
    },
    account_reactivated: {
      subject: 'Your Password-Encrypt account has been reactivated',
      heading: 'Account reactivated',
      paragraphs: [
        `Hello ${displayName},`,
        `<strong>${accountName}</strong> has been reactivated.`,
        'Your account services are available again according to your current plan.',
        'Your vault still requires your master password.'
      ],
      button: { label: 'Open Password-Encrypt', url: billingUrl }
    },
    account_deletion_requested: {
      subject: 'Your Password-Encrypt account deletion has been requested',
      heading: 'Account deletion requested',
      paragraphs: [
        `Hello ${displayName},`,
        `A deletion request has been confirmed for <strong>${accountName}</strong>.`,
        deletionDate ? `The account is scheduled for deletion on ${escapeHtml(deletionDate)}.` : 'The account is now within its deletion safety period.',
        `You can cancel the request before the scheduled deletion date. If you did not request this, contact ${support} immediately.`
      ],
      button: { label: 'Review Account', url: billingUrl }
    },
    account_deletion_completed: {
      subject: 'Your Password-Encrypt account has been deleted',
      heading: 'Account deletion completed',
      paragraphs: [
        `Hello ${displayName},`,
        `The requested deletion of <strong>${accountName}</strong> has been completed.`,
        'The deleted account can no longer use Password-Encrypt cloud account services. Limited payment, invoice or legal records may remain with payment/service providers where retention is required.',
        `If you have any questions about this confirmation, contact ${support}.`
      ]
    }
  };
  return definitions[type] || null;
}

export const CUSTOMER_EMAIL_TYPES = Object.freeze([
  'welcome_trial_started', 'welcome_account_activated', 'trial_started', 'trial_extended',
  'trial_ending_soon', 'trial_expired', 'subscription_activated', 'upcoming_renewal',
  'payment_failed', 'payment_action_required', 'grace_period_started', 'subscription_cancelled',
  'cancellation_scheduled', 'subscription_reactivated', 'plan_changed', 'email_changed',
  'mobile_changed', 'new_device_verified', 'account_suspended', 'account_reactivated',
  'account_deletion_requested', 'account_deletion_completed'
]);

export async function loadCustomerEmailContext(tenantId, { userId = '' } = {}) {
  if (!tenantId) return { tenant: null, user: null, subscription: null, plan: null };
  const [tenantRows, subscriptionRows] = await Promise.all([
    selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,trial_started_at,trial_ends_at,onboarding_completed_at&id=${eq(tenantId)}&limit=1`).catch(() => []),
    selectRows('tenant_subscriptions', `select=id,tenant_id,plan_code,status,billing_interval,currency,price_minor,trial_started_at,trial_ends_at,current_period_start,current_period_end,cancel_at_period_end,cancelled_at,grace_period_ends_at,next_invoice_amount_minor,next_invoice_currency,next_invoice_at,last_payment_failed_at,provider,provider_subscription_id,updated_at&tenant_id=${eq(tenantId)}&limit=1`).catch(() => [])
  ]);
  const tenant = tenantRows?.[0] || null;
  const subscription = subscriptionRows?.[0] || null;
  const userQuery = userId
    ? `select=id,tenant_id,email,phone_e164,display_name,email_verified,first_tenant_owner,welcome_email_sent_at,onboarding_completed_at,created_at&id=${eq(userId)}&tenant_id=${eq(tenantId)}&limit=1`
    : `select=id,tenant_id,email,phone_e164,display_name,email_verified,first_tenant_owner,welcome_email_sent_at,onboarding_completed_at,created_at&tenant_id=${eq(tenantId)}&order=first_tenant_owner.desc,created_at.asc&limit=5`;
  const userRows = await selectRows('users', userQuery).catch(() => []);
  const user = userRows?.find((row) => row.email && row.email_verified) || userRows?.find((row) => row.email) || userRows?.[0] || null;
  const planCode = subscription?.plan_code || tenant?.plan_code || '';
  const planRows = planCode ? await selectRows('subscription_plans', `select=code,display_name,currency&code=${eq(planCode)}&limit=1`).catch(() => []) : [];
  return { tenant, user, subscription, plan: planRows?.[0] || null };
}

function mergedContext(loaded, context = {}) {
  return {
    displayName: loaded?.user?.display_name || '',
    accountEmail: loaded?.user?.email || '',
    accountPhone: loaded?.user?.phone_e164 || '',
    accountName: loaded?.tenant?.account_name || loaded?.tenant?.name || 'Password-Encrypt',
    planCode: loaded?.subscription?.plan_code || loaded?.tenant?.plan_code || '',
    planName: loaded?.plan?.display_name || loaded?.subscription?.plan_code || loaded?.tenant?.plan_code || 'Password-Encrypt',
    trialEndsAt: loaded?.subscription?.trial_ends_at || loaded?.tenant?.trial_ends_at || null,
    currentPeriodEnd: loaded?.subscription?.current_period_end || null,
    renewalAt: loaded?.subscription?.next_invoice_at || loaded?.subscription?.current_period_end || null,
    amountMinor: loaded?.subscription?.next_invoice_amount_minor ?? loaded?.subscription?.price_minor ?? null,
    currency: loaded?.subscription?.next_invoice_currency || loaded?.subscription?.currency || loaded?.plan?.currency || 'GBP',
    gracePeriodEndsAt: loaded?.subscription?.grace_period_ends_at || null,
    ...context
  };
}

async function getEmailLog(idempotencyKey) {
  if (!idempotencyKey) return null;
  const rows = await selectRows('customer_email_log', `select=*&idempotency_key=${eq(idempotencyKey)}&limit=1`);
  return rows?.[0] || null;
}

async function createOrClaimLog({ existing, tenantId, userId, type, idempotencyKey, recipientMasked, subject, metadata }) {
  const now = new Date().toISOString();
  if (existing?.id) {
    return updateRow('customer_email_log', `id=${eq(existing.id)}`, {
      status: 'sending',
      attempts: Number(existing.attempts || 0) + 1,
      recipient_masked: recipientMasked,
      subject,
      error_message: null,
      last_attempt_at: now,
      metadata: { ...(existing.metadata || {}), ...(metadata || {}), version: APP_VERSION },
      updated_at: now
    });
  }
  return insertRow('customer_email_log', {
    id: publicId('customer_email'),
    tenant_id: tenantId || null,
    user_id: userId || null,
    email_type: type,
    idempotency_key: idempotencyKey,
    recipient_masked: recipientMasked,
    subject,
    provider: 'resend',
    provider_reference: null,
    status: 'sending',
    attempts: 1,
    error_message: null,
    last_attempt_at: now,
    sent_at: null,
    metadata: { ...(metadata || {}), version: APP_VERSION },
    created_at: now,
    updated_at: now
  });
}

export async function sendCustomerLifecycleEmail({
  tenantId = '', userId = '', to = '', type, idempotencyKey, context = {}, metadata = {}, maxAttempts = 5
}) {
  if (!CUSTOMER_EMAIL_TYPES.includes(type)) throw new Error(`Unsupported customer email type: ${type}`);
  if (!idempotencyKey) throw new Error('Customer lifecycle email idempotency key is required.');

  let existing = await getEmailLog(idempotencyKey);
  if (existing?.status === 'sent') return { sent: false, skipped: true, reason: 'already_sent', log: existing };
  if (Number(existing?.attempts || 0) >= Math.max(1, Number(maxAttempts || 5))) {
    return { sent: false, skipped: true, reason: 'retry_limit_reached', log: existing };
  }

  const loaded = tenantId ? await loadCustomerEmailContext(tenantId, { userId }) : { tenant: null, user: null, subscription: null, plan: null };
  const recipient = String(to || loaded?.user?.email || '').trim().toLowerCase();
  if (!recipient || !recipient.includes('@')) return { sent: false, skipped: true, reason: 'no_verified_email' };
  const finalContext = mergedContext(loaded, context);
  const definition = emailDefinition(type, finalContext);
  if (!definition) throw new Error('Customer lifecycle email template is unavailable.');

  const recipientMasked = maskEmail(recipient);
  let log;
  try {
    log = await createOrClaimLog({
      existing, tenantId, userId: userId || loaded?.user?.id || '', type, idempotencyKey, recipientMasked, subject: definition.subject,
      metadata: { ...(metadata || {}), template_context: finalContext }
    });
  } catch (error) {
    // A concurrent caller may have inserted the same unique idempotency key.
    existing = await getEmailLog(idempotencyKey).catch(() => null);
    if (existing?.status === 'sent' || existing?.status === 'sending') return { sent: false, skipped: true, reason: existing.status, log: existing };
    throw error;
  }

  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) {
    const message = 'Customer email delivery is not configured.';
    await updateRow('customer_email_log', `id=${eq(log.id)}`, { status: 'failed', error_message: message, updated_at: new Date().toISOString() }).catch(() => null);
    await recordOperationalEvent({ source: 'resend', eventType: 'resend_delivery_failure', severity: 'error', errorCode: 'RESEND_NOT_CONFIGURED', message: 'A customer email could not be sent because Resend is not configured.', tenantId: tenantId || null, userId: userId || loaded?.user?.id || null, metadata: { emailType: type } });
    return { sent: false, provider: 'resend', reason: message, logId: log.id };
  }

  const paragraphs = definition.paragraphs.map((paragraph) => `<p style="margin:0 0 14px;line-height:1.62;color:#536579">${paragraph}</p>`).join('');
  const button = definition.button?.url && definition.button?.label
    ? `<p style="margin:22px 0 4px"><a href="${escapeHtml(definition.button.url)}" style="display:inline-block;background:#173a5d;color:#fff;text-decoration:none;border-radius:999px;padding:13px 18px;font-weight:700">${escapeHtml(definition.button.label)}</a></p>`
    : '';
  const textParagraphs = definition.paragraphs.map(plainText).filter(Boolean);
  if (definition.button?.url) textParagraphs.push(`${definition.button.label}: ${definition.button.url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'Idempotency-Key': String(idempotencyKey).slice(0, 256)
      },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: recipient,
        subject: definition.subject,
        html: `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:28px"><h1 style="margin:0 0 16px;color:#14263b;font-size:26px">${definition.heading}</h1>${paragraphs}${button}<p style="margin-top:24px;font-size:13px;line-height:1.5;color:#7b8fa3">Password-Encrypt · A ZippyWeb project<br>Support: info@zippyweb.uk<br><a href="${baseUrl()}/terms" style="color:#536579">Terms</a> · <a href="${baseUrl()}/privacy" style="color:#536579">Privacy</a> · <a href="${baseUrl()}/billing-terms" style="color:#536579">Billing &amp; refunds</a></p></div></div></body></html>`,
        text: `${textParagraphs.join('\n\n')}\n\nPassword-Encrypt · A ZippyWeb project\nSupport: info@zippyweb.uk\nTerms: ${baseUrl()}/terms\nPrivacy: ${baseUrl()}/privacy\nBilling & refunds: ${baseUrl()}/billing-terms`
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = data?.message || `Email provider returned HTTP ${response.status}.`;
      await updateRow('customer_email_log', `id=${eq(log.id)}`, {
        status: 'failed', error_message: String(reason).slice(0, 800), updated_at: new Date().toISOString()
      }).catch(() => null);
      await recordOperationalEvent({ source: 'resend', eventType: 'resend_delivery_failure', severity: 'error', errorCode: `HTTP_${response.status}`, message: 'Resend rejected a customer email delivery request.', tenantId: tenantId || null, userId: userId || loaded?.user?.id || null, metadata: { emailType: type, httpStatus: response.status } });
      return { sent: false, provider: 'resend', reason, details: data, logId: log.id };
    }
    const sentAt = new Date().toISOString();
    const updated = await updateRow('customer_email_log', `id=${eq(log.id)}`, {
      provider: 'resend',
      provider_reference: data?.id || null,
      status: 'sent',
      error_message: null,
      sent_at: sentAt,
      updated_at: sentAt
    }).catch(() => null);
    return { sent: true, provider: 'resend', providerId: data?.id || '', log: updated || log };
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'Customer email delivery timed out.' : (error.message || 'Customer email delivery failed.');
    await updateRow('customer_email_log', `id=${eq(log.id)}`, {
      status: 'failed', error_message: String(reason).slice(0, 800), updated_at: new Date().toISOString()
    }).catch(() => null);
    await recordOperationalEvent({ source: 'resend', eventType: 'resend_delivery_failure', severity: 'error', errorCode: error?.name || 'RESEND_DELIVERY_FAILED', message: 'A customer email delivery request failed or timed out.', tenantId: tenantId || null, userId: userId || loaded?.user?.id || null, metadata: { emailType: type } });
    return { sent: false, provider: 'resend', reason, logId: log.id };
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendCustomerLifecycleEmailForTenant(tenantId, options = {}) {
  return sendCustomerLifecycleEmail({ tenantId, ...options });
}
