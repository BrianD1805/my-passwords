import { APP_VERSION } from './_db.js';

function baseUrl() {
  const raw = String(process.env.URL || 'https://password-encrypt.com').replace(/\/$/, '');
  return /^https?:\/\//i.test(raw) ? raw : 'https://password-encrypt.com';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(value));
}

function emailDefinition(type, context = {}) {
  const name = escapeHtml(context.displayName || 'there');
  const account = escapeHtml(context.accountName || 'your Password-Encrypt account');
  const plan = escapeHtml(context.planName || 'Password-Encrypt');
  const trialEnd = formatDate(context.trialEndsAt);
  const deletionDate = formatDate(context.deletionScheduledFor);
  const support = 'info@zippyweb.uk';

  const definitions = {
    welcome: {
      subject: 'Welcome to Password-Encrypt',
      heading: 'Welcome to Password-Encrypt',
      paragraphs: [
        `Hello ${name},`,
        `Your account <strong>${account}</strong> is active on the ${plan} plan.`,
        'You can now use verified devices for account services and encrypted cloud backup where included in your plan.',
        'Password-Encrypt does not keep a server-side copy of your master password or send it by email, so support cannot recover or reset it. Secure device unlock, if enabled later, keeps a separately protected wrapped copy only on that device.'
      ]
    },
    payment_attention: {
      subject: 'Your Password-Encrypt payment needs attention',
      heading: 'Payment needs attention',
      paragraphs: [
        `Hello ${name},`,
        `A payment issue is affecting <strong>${account}</strong>.`,
        'Please open Password-Encrypt and review Plan & Billing to update your payment method or complete any required billing action.',
        'Your encrypted local vault remains protected by your master password.'
      ]
    },
    account_suspended: {
      subject: 'Your Password-Encrypt account has been suspended',
      heading: 'Account suspended',
      paragraphs: [
        `Hello ${name},`,
        `<strong>${account}</strong> has been suspended by the Password-Encrypt administrator.`,
        'Account services, encrypted cloud backup and syncing may remain unavailable while the suspension is active.',
        `Contact ${support} if you need help.`
      ]
    },
    account_reactivated: {
      subject: 'Your Password-Encrypt account has been reactivated',
      heading: 'Account reactivated',
      paragraphs: [
        `Hello ${name},`,
        `<strong>${account}</strong> has been reactivated.`,
        'You can verify your device again if needed and continue using the account services included in your plan.',
        'Your vault still requires the correct master password.'
      ]
    },
    trial_extended: {
      subject: 'Your Password-Encrypt trial has been extended',
      heading: 'Trial extended',
      paragraphs: [
        `Hello ${name},`,
        `The trial for <strong>${account}</strong> has been extended${trialEnd ? ` until ${escapeHtml(trialEnd)}` : ''}.`,
        'Your current plan features remain available during the extended trial period.',
        'Your vault remains encrypted. The master password is the primary secret used to decrypt it; a device you deliberately set up may also use Secure device unlock.'
      ]
    },
    deletion_status: {
      subject: 'Password-Encrypt account deletion status',
      heading: 'Account deletion status',
      paragraphs: [
        `Hello ${name},`,
        context.deletionStatus === 'pending'
          ? `Deletion of <strong>${account}</strong> is scheduled${deletionDate ? ` for ${escapeHtml(deletionDate)}` : ''}.`
          : context.deletionStatus === 'cancelled'
            ? `The deletion request for <strong>${account}</strong> has been cancelled.`
            : `The current deletion status for <strong>${account}</strong> is ${escapeHtml(context.deletionStatus || 'not scheduled')}.`,
        'Open Password-Encrypt to review the current account deletion status.',
        `Contact ${support} if this was not expected.`
      ]
    },
    account_status: {
      subject: 'Your Password-Encrypt account status',
      heading: 'Account status update',
      paragraphs: [
        `Hello ${name},`,
        `The current status of <strong>${account}</strong> is ${escapeHtml(context.accountStatus || 'active')}.`,
        `Your plan is ${plan}.`,
        'Your master password remains the primary encryption secret. Secure device unlock can only use a locally protected wrapped copy on a device you deliberately set up.'
      ]
    }
  };

  return definitions[type] || null;
}

export function adminEmailTypesForCustomer({ user, tenant, subscription, deletion }) {
  const options = [];
  if (user?.email && !user.email_verified) options.push({ value: 'verification', label: 'Resend account verification code' });
  if (user?.email && user.email_verified) options.push({ value: 'welcome', label: 'Resend welcome email' });
  if (['past_due', 'unpaid', 'incomplete'].includes(String(subscription?.status || '').toLowerCase())) options.push({ value: 'payment_attention', label: 'Resend payment attention email' });
  if (String(tenant?.account_status || '').toLowerCase() === 'suspended') options.push({ value: 'account_suspended', label: 'Resend suspension email' });
  if (String(tenant?.account_status || '').toLowerCase() === 'active') options.push({ value: 'account_reactivated', label: 'Send account active email' });
  if (tenant?.trial_ends_at) options.push({ value: 'trial_extended', label: 'Send trial status email' });
  if (deletion?.status && deletion.status !== 'none') options.push({ value: 'deletion_status', label: 'Send deletion status email' });
  options.push({ value: 'account_status', label: 'Send general account status email' });
  return options;
}

export async function sendAdminAccountEmail({ to, type, context = {} }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from) {
    const error = new Error('Account email delivery is not configured in Netlify.');
    error.status = 503;
    throw error;
  }
  const definition = emailDefinition(type, context);
  if (!definition) {
    const error = new Error('That account email type is not available.');
    error.status = 400;
    throw error;
  }

  const paragraphs = definition.paragraphs.map((paragraph) => `<p style="margin:0 0 14px;line-height:1.62;color:#536579">${paragraph}</p>`).join('');
  const plainText = definition.paragraphs.map((paragraph) => String(paragraph).replace(/<[^>]+>/g, '')).join('\n\n');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to,
      subject: definition.subject,
      html: `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:28px"><h1 style="margin:0 0 16px;color:#14263b;font-size:26px">${definition.heading}</h1>${paragraphs}<p style="margin-top:22px;font-size:13px;line-height:1.5;color:#7b8fa3">Password-Encrypt · A ZippyWeb project · ${APP_VERSION}<br>Support: info@zippyweb.uk<br><a href="${baseUrl()}/terms" style="color:#536579">Terms</a> · <a href="${baseUrl()}/privacy" style="color:#536579">Privacy</a> · <a href="${baseUrl()}/billing-terms" style="color:#536579">Billing &amp; refunds</a></p></div></div></body></html>`,
      text: `${plainText}\n\nPassword-Encrypt · A ZippyWeb project\nSupport: info@zippyweb.uk\nTerms: ${baseUrl()}/terms\nPrivacy: ${baseUrl()}/privacy\nBilling & refunds: ${baseUrl()}/billing-terms\n${APP_VERSION}`
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.message || `Resend returned HTTP ${response.status}.`);
    error.status = 502;
    error.details = data;
    throw error;
  }
  return { sent: true, provider: 'resend', providerId: data?.id || '' };
}
