import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { clearCustomerSession } from './_auth.js';
import { createAccountOtp, maskEmail, maskPhone, verifyAccountOtp } from './_account-otp.js';
import { revokeAllCustomerSessions, revokeDeviceSessions, validateCustomerSession } from './_account-session.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function cleanDigits(value) { return String(value || '').replace(/\D/g, ''); }
function normaliseCountryCode(value) { const digits = cleanDigits(value); return digits ? `+${digits}` : ''; }
function normaliseLocalPhone(value) { return cleanDigits(value).replace(/^0+/, ''); }
function buildPhoneE164(countryCode, phoneNumber) { const code = normaliseCountryCode(countryCode); const local = normaliseLocalPhone(phoneNumber); return code && local ? `${code}${local}` : ''; }
function safeText(value, max = 240) { return String(value || '').trim().slice(0, max); }

async function loadUser(session) {
  const rows = await selectRows('users', `select=id,tenant_id,email,display_name,role,status,phone_country_code,phone_number,phone_e164,email_verified,phone_verified,session_generation&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`);
  return rows?.[0] || null;
}

async function audit(session, action, metadata = {}) {
  return insertRow('audit_log', { id: publicId('audit'), tenant_id: session.tenantId, user_id: session.userId, action, metadata: { version: APP_VERSION, ...metadata } }).catch(() => null);
}

async function securitySnapshot(validation) {
  const session = validation.session;
  const [user, devices, sessions, deletionRows] = await Promise.all([
    loadUser(session),
    selectRows('account_devices', `select=id,client_device_id,device_name,device_type,platform,browser,first_verified_at,last_verified_at,last_seen_at,revoked_at,revoked_reason&user_id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&order=last_seen_at.desc`),
    selectRows('account_sessions', `select=id,device_id,status,issued_at,expires_at,renewed_at,last_seen_at,revoked_at,revoked_reason&user_id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&order=last_seen_at.desc&limit=100`),
    selectRows('account_deletion_requests', `select=id,status,requested_at,scheduled_for,cancelled_at,completed_at,reason&tenant_id=${eq(session.tenantId)}&order=created_at.desc&limit=1`).catch(() => [])
  ]);
  const sessionList = sessions || [];
  return {
    user: user ? {
      displayName: user.display_name || '',
      email: user.email || '',
      emailMasked: maskEmail(user.email),
      emailVerified: Boolean(user.email_verified),
      phoneCountryCode: user.phone_country_code || '',
      phoneNumber: user.phone_number || '',
      phoneE164: user.phone_e164 || '',
      phoneMasked: maskPhone(user.phone_e164),
      phoneVerified: Boolean(user.phone_verified)
    } : null,
    currentDeviceId: session.deviceId || '',
    currentSessionId: session.sessionId || '',
    sessionExpiresAt: validation.stored?.expires_at || (session.exp ? new Date(session.exp * 1000).toISOString() : ''),
    devices: (devices || []).map((device) => ({
      ...device,
      current: device.id === session.deviceId,
      activeSessions: sessionList.filter((entry) => entry.device_id === device.id && entry.status === 'active' && !entry.revoked_at && new Date(entry.expires_at).getTime() > Date.now()).length
    })),
    sessions: sessionList,
    deletion: deletionRows?.[0] || null,
    deletionWaitingDays: 14
  };
}

async function requireActive(event) {
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) return { response: jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code, message: validation.message }, { 'set-cookie': clearCustomerSession(event) }) };
  const user = await loadUser(validation.session);
  if (!user?.id || String(user.status || '').toLowerCase() !== 'active') return { response: jsonResponse(403, { ok: false, version: APP_VERSION, message: 'This account is not active.' }) };
  return { validation, user };
}

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const active = await requireActive(event);
  if (active.response) return active.response;
  const { validation, user } = active;
  const session = validation.session;

  if (event.httpMethod === 'GET') {
    try {
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await securitySnapshot(validation)) });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not load account security details.', error: error.message, details: error.details || null });
    }
  }

  const body = parseBody(event);
  const action = safeText(body.action, 80);
  try {
    if (action === 'request_email_change') {
      const newEmail = safeText(body.newEmail, 254).toLowerCase();
      if (!newEmail.includes('@')) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter a valid new email address.' });
      const verifyingExistingEmail = newEmail === String(user.email || '').toLowerCase();
      if (verifyingExistingEmail && user.email_verified) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That email address is already verified on your account.' });
      const matches = await selectRows('users', `select=id&email=${eq(newEmail)}&id=neq.${encodeURIComponent(user.id)}&limit=1`);
      if (matches?.[0]) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That email address is already linked to another account.' });
      const otp = await createAccountOtp({ tenantId: session.tenantId, userId: session.userId, purpose: 'change_email', channel: 'email', destination: newEmail, metadata: { previous_email_masked: maskEmail(user.email) } });
      await insertRow('account_contact_changes', { id: publicId('contactchange'), tenant_id: session.tenantId, user_id: session.userId, change_type: verifyingExistingEmail ? 'email_verification' : 'email', previous_value: user.email || '', requested_value: newEmail, challenge_id: otp.challengeId, status: 'pending_verification', requested_at: new Date().toISOString(), expires_at: otp.expiresAt, metadata: { version: APP_VERSION } });
      await audit(session, 'account_email_change_requested', { destination_masked: otp.destinationMasked });
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...otp, message: `A verification code was sent to ${otp.destinationMasked}.` });
    }

    if (action === 'confirm_email_change') {
      const challenge = await verifyAccountOtp({ challengeId: safeText(body.challengeId, 180), code: body.code, purpose: 'change_email', tenantId: session.tenantId, userId: session.userId });
      const changes = await selectRows('account_contact_changes', `select=*&challenge_id=${eq(challenge.id)}&user_id=${eq(session.userId)}&limit=1`);
      const change = changes?.[0];
      if (!change?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The pending email change was not found.' });
      const now = new Date().toISOString();
      await updateRow('users', `id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}`, { email: change.requested_value, email_verified: true, updated_at: now });
      await updateRow('account_contact_changes', `id=${eq(change.id)}`, { status: 'verified', verified_at: now, updated_at: now });
      await updateRow('account_sessions', `user_id=${eq(session.userId)}&status=${eq('active')}&id=neq.${encodeURIComponent(session.sessionId || '')}`, { status: 'revoked', revoked_at: now, revoked_reason: 'email_changed', updated_at: now }).catch(() => null);
      await audit(session, 'account_email_changed', { previous_masked: maskEmail(change.previous_value), new_masked: maskEmail(change.requested_value) });
      return jsonResponse(200, { ok: true, version: APP_VERSION, email: change.requested_value, emailMasked: maskEmail(change.requested_value), message: 'Your email address has been verified and updated. Other account sessions were ended for safety.' });
    }

    if (action === 'request_phone_change') {
      const phoneCountryCode = normaliseCountryCode(body.phoneCountryCode);
      const phoneNumber = normaliseLocalPhone(body.phoneNumber);
      const phoneE164 = buildPhoneE164(phoneCountryCode, phoneNumber);
      if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter a valid mobile number with country code.' });
      const verifyingExistingPhone = phoneE164 === user.phone_e164;
      if (verifyingExistingPhone && user.phone_verified) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That mobile number is already verified on your account.' });
      const matches = await selectRows('users', `select=id&phone_e164=${eq(phoneE164)}&id=neq.${encodeURIComponent(user.id)}&limit=1`);
      if (matches?.[0]) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That mobile number is already linked to another account.' });
      const otp = await createAccountOtp({ tenantId: session.tenantId, userId: session.userId, purpose: 'change_phone', channel: 'sms', destination: phoneE164, metadata: { previous_phone_masked: maskPhone(user.phone_e164) } });
      await insertRow('account_contact_changes', { id: publicId('contactchange'), tenant_id: session.tenantId, user_id: session.userId, change_type: verifyingExistingPhone ? 'phone_verification' : 'phone', previous_value: user.phone_e164 || '', requested_value: phoneE164, phone_country_code: phoneCountryCode, phone_number: phoneNumber, challenge_id: otp.challengeId, status: 'pending_verification', requested_at: new Date().toISOString(), expires_at: otp.expiresAt, metadata: { version: APP_VERSION } });
      await audit(session, 'account_phone_change_requested', { destination_masked: otp.destinationMasked });
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...otp, message: otp.delivery.sent ? `A verification code was sent to ${otp.destinationMasked}.` : 'A local test code was created because SMS delivery is unavailable in development mode.' });
    }

    if (action === 'confirm_phone_change') {
      const challenge = await verifyAccountOtp({ challengeId: safeText(body.challengeId, 180), code: body.code, purpose: 'change_phone', tenantId: session.tenantId, userId: session.userId });
      const changes = await selectRows('account_contact_changes', `select=*&challenge_id=${eq(challenge.id)}&user_id=${eq(session.userId)}&limit=1`);
      const change = changes?.[0];
      if (!change?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The pending mobile change was not found.' });
      const now = new Date().toISOString();
      await updateRow('users', `id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}`, { phone_e164: change.requested_value, phone_country_code: change.phone_country_code, phone_number: change.phone_number, phone_verified: true, updated_at: now });
      await updateRow('account_contact_changes', `id=${eq(change.id)}`, { status: 'verified', verified_at: now, updated_at: now });
      await updateRow('account_sessions', `user_id=${eq(session.userId)}&status=${eq('active')}&id=neq.${encodeURIComponent(session.sessionId || '')}`, { status: 'revoked', revoked_at: now, revoked_reason: 'phone_changed', updated_at: now }).catch(() => null);
      await audit(session, 'account_phone_changed', { previous_masked: maskPhone(change.previous_value), new_masked: maskPhone(change.requested_value) });
      return jsonResponse(200, { ok: true, version: APP_VERSION, phoneE164: change.requested_value, phoneMasked: maskPhone(change.requested_value), phoneCountryCode: change.phone_country_code, phoneNumber: change.phone_number, message: 'Your mobile number has been verified and updated. Other account sessions were ended for safety.' });
    }

    if (action === 'revoke_device') {
      const deviceId = safeText(body.deviceId, 180);
      if (!deviceId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Choose a device to remove.' });
      const devices = await selectRows('account_devices', `select=id,device_name&user_id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&id=${eq(deviceId)}&limit=1`);
      if (!devices?.[0]) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'That verified device was not found.' });
      await revokeDeviceSessions({ userId: session.userId, deviceId, reason: 'removed_by_customer' });
      await audit(session, 'verified_device_removed', { device_id: deviceId, device_name: devices[0].device_name || '' });
      const current = deviceId === session.deviceId;
      return jsonResponse(200, { ok: true, version: APP_VERSION, currentSessionEnded: current, message: current ? 'This device was removed and its account session ended.' : 'The selected device and its account sessions were removed.' }, current ? { 'set-cookie': clearCustomerSession(event) } : {});
    }

    if (action === 'revoke_all_sessions') {
      await revokeAllCustomerSessions({ tenantId: session.tenantId, userId: session.userId, reason: 'ended_all_by_customer' });
      await audit(session, 'all_account_sessions_ended');
      return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, message: 'All account sessions have ended. Verify a device again to use cloud account features.' }, { 'set-cookie': clearCustomerSession(event) });
    }

    if (action === 'request_deletion_code') {
      if (!user.email || !user.email_verified) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'A verified email address is required before account deletion can be requested.' });
      const otp = await createAccountOtp({ tenantId: session.tenantId, userId: session.userId, purpose: 'account_deletion', channel: 'email', destination: user.email });
      await audit(session, 'account_deletion_verification_requested');
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...otp, message: `A deletion verification code was sent to ${otp.destinationMasked}.` });
    }

    if (action === 'confirm_deletion') {
      await verifyAccountOtp({ challengeId: safeText(body.challengeId, 180), code: body.code, purpose: 'account_deletion', tenantId: session.tenantId, userId: session.userId });
      const existing = await selectRows('account_deletion_requests', `select=*&tenant_id=${eq(session.tenantId)}&status=${eq('pending')}&limit=1`).catch(() => []);
      if (existing?.[0]) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Account deletion is already scheduled.', deletion: existing[0] });
      const now = new Date();
      const scheduledFor = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const deletion = await insertRow('account_deletion_requests', { id: publicId('deletion'), tenant_id: session.tenantId, user_id: session.userId, status: 'pending', requested_at: now.toISOString(), scheduled_for: scheduledFor, reason: safeText(body.reason, 500), contact_email_masked: maskEmail(user.email), metadata: { version: APP_VERSION, waiting_days: 14 } });
      await updateRow('tenants', `id=${eq(session.tenantId)}`, { deletion_status: 'pending', deletion_requested_at: now.toISOString(), deletion_scheduled_for: scheduledFor, updated_at: now.toISOString() });
      await audit(session, 'account_deletion_scheduled', { scheduled_for: scheduledFor });
      return jsonResponse(200, { ok: true, version: APP_VERSION, deletion, message: 'Account deletion is scheduled after the 14-day safety period. You can cancel it before that date.' });
    }

    if (action === 'cancel_deletion') {
      const rows = await selectRows('account_deletion_requests', `select=*&tenant_id=${eq(session.tenantId)}&status=${eq('pending')}&limit=1`);
      const deletion = rows?.[0];
      if (!deletion?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'No pending account deletion request was found.' });
      const now = new Date().toISOString();
      await updateRow('account_deletion_requests', `id=${eq(deletion.id)}`, { status: 'cancelled', cancelled_at: now, updated_at: now });
      await updateRow('tenants', `id=${eq(session.tenantId)}`, { deletion_status: 'cancelled', deletion_requested_at: null, deletion_scheduled_for: null, updated_at: now });
      await audit(session, 'account_deletion_cancelled');
      return jsonResponse(200, { ok: true, version: APP_VERSION, message: 'The pending account deletion has been cancelled.' });
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown account security action.' });
  } catch (error) {
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, message: error.message || 'The account security action could not be completed.', error: error.status ? undefined : error.message, details: error.details || null });
  }
}
