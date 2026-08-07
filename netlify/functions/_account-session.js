import { createHash } from 'node:crypto';
import { insertRow, publicId, selectRows, updateRow } from './_db.js';
import { issueCustomerSession, readCustomerSession } from './_auth.js';
import { sendCustomerLifecycleEmailForTenant } from './_customer-email.js';

const SESSION_DAYS = 30;
const RENEW_WITHIN_DAYS = 7;
const TOUCH_AFTER_MINUTES = 5;

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function cleanText(value, max = 160) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function requestHeader(event, name) {
  return event?.headers?.[name] || event?.headers?.[name.toLowerCase()] || event?.headers?.[name.toUpperCase()] || '';
}

function requestFingerprint(event) {
  const forwarded = requestHeader(event, 'x-forwarded-for');
  const ip = cleanText(String(forwarded || '').split(',')[0], 120);
  if (!ip) return '';
  const secret = process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'my-passwords-session-fingerprint';
  return createHash('sha256').update(`${ip}:${secret}`).digest('hex');
}

function userAgentDetails(event, supplied = {}) {
  const userAgent = cleanText(supplied.userAgent || requestHeader(event, 'user-agent'), 500);
  const platform = cleanText(supplied.platform || requestHeader(event, 'sec-ch-ua-platform'), 120).replace(/^"|"$/g, '');
  const browser = cleanText(supplied.browser || requestHeader(event, 'sec-ch-ua'), 180);
  const deviceType = cleanText(supplied.deviceType || (/Mobile|Android|iPhone|iPad/i.test(userAgent) ? 'mobile' : 'computer'), 40) || 'browser';
  return { userAgent, platform, browser, deviceType };
}

function sessionExpiry(days = SESSION_DAYS) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function customerSessionDays() {
  return SESSION_DAYS;
}

export async function createVerifiedCustomerSession(event, { tenantId, userId, role = 'member', clientDeviceId = '', deviceName = '', deviceType = '', platform = '', browser = '', userAgent = '' }) {
  const now = new Date().toISOString();
  const clientId = cleanText(clientDeviceId, 120) || publicId('install');
  const details = userAgentDetails(event, { deviceType, platform, browser, userAgent });
  const safeName = cleanText(deviceName, 100) || (details.deviceType === 'mobile' ? 'Verified mobile device' : 'Verified computer');
  const existing = await selectRows('account_devices', `select=*&user_id=${eq(userId)}&client_device_id=${eq(clientId)}&limit=1`).catch(() => []);
  const existingDevice = existing?.[0] || null;
  const previousDevices = !existingDevice
    ? await selectRows('account_devices', `select=id&user_id=${eq(userId)}&tenant_id=${eq(tenantId)}&limit=1`).catch(() => [])
    : [];
  const shouldNotifyNewDevice = !existingDevice && Boolean(previousDevices?.[0]?.id);
  let device = existingDevice;

  if (device?.id) {
    device = await updateRow('account_devices', `id=${eq(device.id)}&user_id=${eq(userId)}&tenant_id=${eq(tenantId)}`, {
      device_name: safeName,
      device_type: details.deviceType,
      platform: details.platform,
      browser: details.browser,
      user_agent: details.userAgent,
      last_verified_at: now,
      last_seen_at: now,
      revoked_at: null,
      revoked_reason: null,
      metadata: { ...(device.metadata || {}), last_ip_hash: requestFingerprint(event) || null },
      updated_at: now
    });
  } else {
    device = await insertRow('account_devices', {
      id: publicId('device'),
      tenant_id: tenantId,
      user_id: userId,
      client_device_id: clientId,
      device_name: safeName,
      device_type: details.deviceType,
      platform: details.platform,
      browser: details.browser,
      user_agent: details.userAgent,
      first_verified_at: now,
      last_verified_at: now,
      last_seen_at: now,
      metadata: { last_ip_hash: requestFingerprint(event) || null }
    });
  }

  const userRows = await selectRows('users', `select=session_generation&id=${eq(userId)}&tenant_id=${eq(tenantId)}&limit=1`).catch(() => []);
  const generation = Math.max(1, Number(userRows?.[0]?.session_generation || 1));
  const expiresAt = sessionExpiry();
  const session = await insertRow('account_sessions', {
    id: publicId('session'),
    tenant_id: tenantId,
    user_id: userId,
    device_id: device.id,
    session_generation: generation,
    status: 'active',
    issued_at: now,
    expires_at: expiresAt,
    last_seen_at: now,
    user_agent: details.userAgent,
    metadata: { ip_hash: requestFingerprint(event) || null, app_version: '0.049' }
  });

  if (shouldNotifyNewDevice) {
    await sendCustomerLifecycleEmailForTenant(tenantId, {
      userId,
      type: 'new_device_verified',
      idempotencyKey: `new_device_verified:${device.id}`,
      context: {
        deviceName: device.device_name || safeName,
        platform: device.platform || details.platform || '',
        verifiedAt: now
      },
      metadata: { source: 'device_verification', device_id: device.id }
    }).catch(() => null);
  }

  return {
    device,
    session,
    expiresAt,
    cookie: issueCustomerSession(event, {
      tenantId,
      userId,
      role,
      sessionId: session.id,
      deviceId: device.id,
      sessionGeneration: generation,
      expiresAt
    })
  };
}

export async function validateCustomerSession(event, { touch = false } = {}) {
  const token = readCustomerSession(event);
  if (!token?.tenantId || !token?.userId) return { ok: false, code: 'SESSION_REQUIRED', message: 'Verify this device to continue.' };

  // Legacy signed cookies are accepted briefly so session-status can upgrade them
  // without forcing an existing verified customer to sign in again immediately.
  if (!token.sessionId || !token.deviceId) return { ok: true, session: token, legacy: true, renewRequired: true };

  const rows = await selectRows('account_sessions', `select=*&id=${eq(token.sessionId)}&tenant_id=${eq(token.tenantId)}&user_id=${eq(token.userId)}&limit=1`).catch(() => []);
  const stored = rows?.[0];
  if (!stored?.id || stored.status !== 'active' || stored.revoked_at) return { ok: false, code: 'SESSION_REVOKED', message: 'This account session has ended.' };
  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    await updateRow('account_sessions', `id=${eq(stored.id)}`, { status: 'expired', updated_at: new Date().toISOString() }).catch(() => null);
    return { ok: false, code: 'SESSION_EXPIRED', message: 'This account session has expired. Verify this device again.' };
  }

  const [devices, users] = await Promise.all([
    selectRows('account_devices', `select=*&id=${eq(stored.device_id)}&user_id=${eq(token.userId)}&limit=1`).catch(() => []),
    selectRows('users', `select=session_generation&id=${eq(token.userId)}&tenant_id=${eq(token.tenantId)}&limit=1`).catch(() => [])
  ]);
  const device = devices?.[0];
  const generation = Math.max(1, Number(users?.[0]?.session_generation || 1));
  if (!device?.id || device.revoked_at) return { ok: false, code: 'DEVICE_REVOKED', message: 'This verified device has been removed.' };
  if (Number(stored.session_generation || 1) !== generation || Number(token.sessionGeneration || 1) !== generation) {
    return { ok: false, code: 'SESSION_REVOKED', message: 'This account session has ended.' };
  }

  const now = Date.now();
  const lastSeen = new Date(stored.last_seen_at || stored.issued_at).getTime();
  if (touch && (!Number.isFinite(lastSeen) || now - lastSeen >= TOUCH_AFTER_MINUTES * 60 * 1000)) {
    const timestamp = new Date().toISOString();
    await Promise.all([
      updateRow('account_sessions', `id=${eq(stored.id)}`, { last_seen_at: timestamp, updated_at: timestamp }).catch(() => null),
      updateRow('account_devices', `id=${eq(device.id)}`, { last_seen_at: timestamp, updated_at: timestamp }).catch(() => null)
    ]);
  }

  const renewRequired = new Date(stored.expires_at).getTime() - now <= RENEW_WITHIN_DAYS * 24 * 60 * 60 * 1000;
  return {
    ok: true,
    session: { ...token, sessionId: stored.id, deviceId: device.id, sessionGeneration: generation },
    stored,
    device,
    legacy: false,
    renewRequired
  };
}

export async function upgradeOrRenewCustomerSession(event, validation, { role = 'member', clientDeviceId = '', deviceName = '', deviceType = '', platform = '', browser = '', userAgent = '' } = {}) {
  if (!validation?.ok) return null;
  if (validation.legacy) {
    return createVerifiedCustomerSession(event, {
      tenantId: validation.session.tenantId,
      userId: validation.session.userId,
      role: role || validation.session.role || 'member',
      clientDeviceId,
      deviceName,
      deviceType,
      platform,
      browser,
      userAgent
    });
  }
  if (!validation.renewRequired) return null;

  const now = new Date().toISOString();
  const expiresAt = sessionExpiry();
  const updated = await updateRow('account_sessions', `id=${eq(validation.stored.id)}`, {
    expires_at: expiresAt,
    renewed_at: now,
    last_seen_at: now,
    updated_at: now
  });
  await updateRow('account_devices', `id=${eq(validation.device.id)}`, { last_seen_at: now, updated_at: now }).catch(() => null);
  return {
    session: updated,
    device: validation.device,
    expiresAt,
    cookie: issueCustomerSession(event, {
      tenantId: validation.session.tenantId,
      userId: validation.session.userId,
      role: role || validation.session.role || 'member',
      sessionId: validation.stored.id,
      deviceId: validation.device.id,
      sessionGeneration: validation.session.sessionGeneration,
      expiresAt
    })
  };
}

export async function revokeSession(sessionId, reason = 'ended_by_customer') {
  const now = new Date().toISOString();
  return updateRow('account_sessions', `id=${eq(sessionId)}`, { status: 'revoked', revoked_at: now, revoked_reason: cleanText(reason, 120), updated_at: now });
}

export async function revokeDeviceSessions({ userId, deviceId, reason = 'device_removed' }) {
  const now = new Date().toISOString();
  await updateRow('account_sessions', `user_id=${eq(userId)}&device_id=${eq(deviceId)}&status=${eq('active')}`, {
    status: 'revoked', revoked_at: now, revoked_reason: cleanText(reason, 120), updated_at: now
  }).catch(() => null);
  return updateRow('account_devices', `id=${eq(deviceId)}&user_id=${eq(userId)}`, {
    revoked_at: now, revoked_reason: cleanText(reason, 120), updated_at: now
  });
}

export async function revokeAllCustomerSessions({ tenantId, userId, reason = 'all_sessions_ended' }) {
  const now = new Date().toISOString();
  const userRows = await selectRows('users', `select=session_generation&id=${eq(userId)}&tenant_id=${eq(tenantId)}&limit=1`).catch(() => []);
  const nextGeneration = Math.max(1, Number(userRows?.[0]?.session_generation || 1)) + 1;
  await updateRow('users', `id=${eq(userId)}&tenant_id=${eq(tenantId)}`, { session_generation: nextGeneration, updated_at: now });
  await updateRow('account_sessions', `user_id=${eq(userId)}&tenant_id=${eq(tenantId)}&status=${eq('active')}`, {
    status: 'revoked', revoked_at: now, revoked_reason: cleanText(reason, 120), updated_at: now
  }).catch(() => null);
  return nextGeneration;
}
