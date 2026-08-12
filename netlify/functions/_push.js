import { createCipheriv, createECDH, createHash, createPrivateKey, hkdfSync, randomBytes, sign as cryptoSign } from 'node:crypto';
import { APP_VERSION, insertRow, publicId, selectRows, updateRow } from './_db.js';

const DEFAULT_TARGET_URL = '/vault';
const MAX_PUSH_BODY = 220;
const MAX_PUSH_TITLE = 80;

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 500) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function b64url(buffer) { return Buffer.from(buffer).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function fromB64url(value) {
  const normal = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = normal.length % 4 ? '='.repeat(4 - (normal.length % 4)) : '';
  return Buffer.from(`${normal}${pad}`, 'base64');
}

function configuredKeys() {
  const publicKey = safeText(process.env.PUSH_VAPID_PUBLIC_KEY, 220);
  const privateKey = safeText(process.env.PUSH_VAPID_PRIVATE_KEY, 220);
  const subject = safeText(process.env.PUSH_VAPID_SUBJECT || 'mailto:info@zippyweb.uk', 220);
  const publicBytes = fromB64url(publicKey);
  const privateBytes = fromB64url(privateKey);
  const contactUriValid = /^(mailto:|https:)/i.test(subject);
  const configured = publicBytes.length === 65 && publicBytes[0] === 4 && privateBytes.length === 32 && contactUriValid;
  return { configured, publicKey, privateKey, subject, publicBytes, privateBytes };
}

export function pushConfiguration() {
  const keys = configuredKeys();
  return {
    configured: keys.configured,
    publicKey: keys.configured ? keys.publicKey : '',
    subjectConfigured: Boolean(keys.subject),
    hasPublicKey: Boolean(keys.publicKey),
    hasPrivateKey: Boolean(keys.privateKey)
  };
}

function vapidAuthorization(endpoint, keys) {
  const origin = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(Buffer.from(JSON.stringify({ aud: origin, exp: now + (12 * 60 * 60), sub: keys.subject })));
  const unsigned = `${header}.${payload}`;
  const x = b64url(keys.publicBytes.subarray(1, 33));
  const y = b64url(keys.publicBytes.subarray(33, 65));
  const d = b64url(keys.privateBytes);
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x, y, d }, format: 'jwk' });
  const signature = cryptoSign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${keys.publicKey}`;
}

function encryptPayload(subscription, payload) {
  const clientPublic = fromB64url(subscription.p256dh);
  const authSecret = fromB64url(subscription.auth_secret);
  if (clientPublic.length !== 65 || clientPublic[0] !== 4 || authSecret.length < 16) throw new Error('Push subscription keys are invalid.');

  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublic);
  const authInfo = Buffer.concat([Buffer.from('WebPush: info\0', 'utf8'), clientPublic, serverPublic]);
  const ikm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, authInfo, 32));
  const salt = randomBytes(16);
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12));
  const plaintext = Buffer.concat([Buffer.from(JSON.stringify(payload), 'utf8'), Buffer.from([2])]);
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([serverPublic.length]), serverPublic, ciphertext]);
}

function normaliseTargetUrl(value) {
  const candidate = safeText(value || DEFAULT_TARGET_URL, 300);
  if (!candidate.startsWith('/')) return DEFAULT_TARGET_URL;
  if (candidate.startsWith('//')) return DEFAULT_TARGET_URL;
  return candidate;
}

function renderTemplate(value, variables = {}, max = 500) {
  let output = String(value || '');
  for (const [key, replacement] of Object.entries(variables || {})) {
    output = output.replaceAll(`{${key}}`, safeText(replacement, 200));
  }
  return safeText(output, max);
}

async function recordDeliveryFailure(subscription, status, reason) {
  const now = new Date().toISOString();
  const gone = status === 404 || status === 410;
  const nextFailureCount = Number(subscription.failure_count || 0) + 1;
  await updateRow('push_subscriptions', `id=${eq(subscription.id)}`, {
    status: gone ? 'disabled' : subscription.status || 'active',
    failure_count: nextFailureCount,
    last_failure_at: now,
    disabled_at: gone ? now : subscription.disabled_at || null,
    disabled_reason: gone ? 'Push endpoint expired or unsubscribed.' : safeText(reason, 240),
    updated_at: now
  }).catch(() => null);
  return gone;
}

async function recordDeliverySuccess(subscription) {
  const now = new Date().toISOString();
  await updateRow('push_subscriptions', `id=${eq(subscription.id)}`, {
    status: 'active', failure_count: 0, last_success_at: now, last_failure_at: null,
    disabled_at: null, disabled_reason: null, updated_at: now
  }).catch(() => null);
}

export async function sendPushToSubscription(subscription, notification, { ttl = 86400, urgency = 'normal' } = {}) {
  const keys = configuredKeys();
  if (!keys.configured) return { ok: false, status: 503, disabled: false, message: 'Push delivery is not configured.' };
  if (!subscription?.endpoint || !subscription?.p256dh || !subscription?.auth_secret) return { ok: false, status: 400, disabled: false, message: 'Push subscription is incomplete.' };

  const payload = {
    title: safeText(notification.title, MAX_PUSH_TITLE) || 'Password-Encrypt',
    body: safeText(notification.body, MAX_PUSH_BODY),
    url: normaliseTargetUrl(notification.url),
    tag: safeText(notification.tag || 'password-encrypt', 80),
    requireInteraction: Boolean(notification.requireInteraction),
    version: APP_VERSION
  };
  const body = encryptPayload(subscription, payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: vapidAuthorization(subscription.endpoint, keys),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(Math.max(0, Math.min(2419200, Number(ttl) || 0))),
        urgency: ['very-low', 'low', 'normal', 'high'].includes(urgency) ? urgency : 'normal'
      },
      body
    });
    if (response.ok || response.status === 201) {
      await recordDeliverySuccess(subscription);
      return { ok: true, status: response.status, disabled: false };
    }
    const reason = safeText(await response.text().catch(() => ''), 240) || `Push service returned HTTP ${response.status}.`;
    const disabled = await recordDeliveryFailure(subscription, response.status, reason);
    return { ok: false, status: response.status, disabled, message: reason };
  } catch (error) {
    const reason = error.name === 'AbortError' ? 'Push delivery timed out.' : (error.message || 'Push delivery failed.');
    await recordDeliveryFailure(subscription, 0, reason);
    return { ok: false, status: 0, disabled: false, message: reason };
  } finally {
    clearTimeout(timeout);
  }
}

async function activeSubscriptions(query) {
  return selectRows('push_subscriptions', `select=id,tenant_id,user_id,endpoint,p256dh,auth_secret,status,failure_count,disabled_at&status=eq.active&${query}&order=updated_at.desc&limit=5000`).catch(() => []);
}

async function deliverToRows(rows, notification, options = {}) {
  const unique = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row?.endpoint || seen.has(row.endpoint)) continue;
    seen.add(row.endpoint);
    unique.push(row);
  }
  const summary = { targeted: unique.length, delivered: 0, failed: 0, disabled: 0 };
  const concurrency = 20;
  for (let index = 0; index < unique.length; index += concurrency) {
    const batch = unique.slice(index, index + concurrency);
    const results = await Promise.all(batch.map((subscription) => sendPushToSubscription(subscription, notification, options)));
    for (const result of results) {
      if (result.ok) summary.delivered += 1;
      else summary.failed += 1;
      if (result.disabled) summary.disabled += 1;
    }
  }
  return summary;
}

export async function sendPushToUser({ tenantId, userId, notification, options = {} }) {
  const rows = await activeSubscriptions(`tenant_id=${eq(tenantId)}&user_id=${eq(userId)}`);
  return deliverToRows(rows, notification, options);
}

export async function sendPushToAll({ notification, options = {} }) {
  const rows = await activeSubscriptions('id=not.is.null');
  return deliverToRows(rows, notification, options);
}

export async function loadPushTemplate(templateKey) {
  const rows = await selectRows('push_notification_templates', `select=*&template_key=${eq(templateKey)}&limit=1`).catch(() => []);
  return rows?.[0] || null;
}

export async function logPushDelivery({ tenantId = null, userId = null, notificationType = 'system', templateKey = null, notification, triggerSource = 'system', summary, metadata = {} }) {
  return insertRow('push_notification_log', {
    id: publicId('push_log'), tenant_id: tenantId || null, user_id: userId || null,
    notification_type: safeText(notificationType, 80), template_key: templateKey || null,
    title: safeText(notification?.title, MAX_PUSH_TITLE), body_preview: safeText(notification?.body, 160),
    target_url: normaliseTargetUrl(notification?.url), trigger_source: safeText(triggerSource, 80) || 'system',
    subscriptions_targeted: Number(summary?.targeted || 0), delivered: Number(summary?.delivered || 0),
    failed: Number(summary?.failed || 0), disabled_endpoints: Number(summary?.disabled || 0),
    metadata: { version: APP_VERSION, ...metadata }, created_at: new Date().toISOString()
  }).catch(() => null);
}

export async function sendTemplatePushToUser({ templateKey, tenantId, userId, variables = {}, urgency = 'normal', requireInteraction = false, triggerSource = 'system', metadata = {} }) {
  if (!tenantId || !userId) return { ok: false, skipped: true, reason: 'Owner identity is unavailable.', targeted: 0, delivered: 0, failed: 0, disabled: 0 };
  const template = await loadPushTemplate(templateKey);
  if (!template?.template_key || template.is_enabled === false) return { ok: true, skipped: true, reason: 'Push template is disabled or unavailable.', targeted: 0, delivered: 0, failed: 0, disabled: 0 };
  const notification = {
    title: renderTemplate(template.title, variables, MAX_PUSH_TITLE),
    body: renderTemplate(template.body, variables, MAX_PUSH_BODY),
    url: normaliseTargetUrl(renderTemplate(template.target_url, variables, 300)),
    tag: templateKey,
    requireInteraction
  };
  const summary = await sendPushToUser({ tenantId, userId, notification, options: { urgency } });
  await logPushDelivery({ tenantId, userId, notificationType: 'template', templateKey, notification, triggerSource, summary, metadata });
  return { ok: true, skipped: false, ...summary, notification };
}

export function pushEndpointHash(endpoint) {
  return createHash('sha256').update(String(endpoint || '')).digest('hex');
}

export function sanitisePushSubscription(value = {}) {
  const endpoint = safeText(value.endpoint, 1800);
  const p256dh = safeText(value.keys?.p256dh || value.p256dh, 300);
  const authSecret = safeText(value.keys?.auth || value.auth, 300);
  if (!/^https:\/\//i.test(endpoint) || p256dh.length < 40 || authSecret.length < 16) return null;
  return { endpoint, p256dh, authSecret };
}
