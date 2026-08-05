import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { createAccountOtp, verifyAccountOtp } from './_account-otp.js';
import { createVerifiedCustomerSession } from './_account-session.js';
import { evaluateTenantAccess } from './_trial.js';
import { resolveTenantEntitlements } from './_entitlements.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 260) { return String(value || '').trim().slice(0, max); }
function cleanDigits(value) { return String(value || '').replace(/\D/g, ''); }
function normalisePhone(value) { const raw = safeText(value, 40); const digits = cleanDigits(raw); return digits ? `+${digits}` : ''; }

async function audit(tenantId, userId, action, metadata = {}) {
  return insertRow('audit_log', { id: publicId('audit'), tenant_id: tenantId, user_id: userId, action, metadata: { version: APP_VERSION, ...metadata } }).catch(() => null);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  const body = parseBody(event);
  const action = safeText(body.action, 60);

  try {
    if (action === 'request') {
      const channel = body.channel === 'sms' ? 'sms' : 'email';
      const destination = channel === 'sms' ? normalisePhone(body.phoneE164 || body.contact) : safeText(body.email || body.contact, 254).toLowerCase();
      if (!destination || (channel === 'email' && !destination.includes('@'))) return jsonResponse(400, { ok: false, version: APP_VERSION, message: channel === 'sms' ? 'Enter a valid verified mobile number.' : 'Enter a valid verified email address.' });
      const query = channel === 'sms'
        ? `select=id,tenant_id,status,phone_verified&phone_e164=${eq(destination)}&phone_verified=${eq(true)}&limit=1`
        : `select=id,tenant_id,status,email_verified&email=${eq(destination)}&email_verified=${eq(true)}&limit=1`;
      const users = await selectRows('users', query);
      const user = users?.[0];
      if (!user?.id || !user?.tenant_id || String(user.status || '').toLowerCase() !== 'active') {
        return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'No active account was found with that verified contact detail.' });
      }
      const otp = await createAccountOtp({ tenantId: user.tenant_id, userId: user.id, purpose: 'account_recovery', channel, destination, metadata: { recovery: true } });
      await audit(user.tenant_id, user.id, 'account_recovery_code_requested', { channel, destination_masked: otp.destinationMasked });
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...otp, channel, message: otp.delivery.sent ? `A recovery code was sent to ${otp.destinationMasked}.` : `A local ${channel === 'sms' ? 'SMS' : 'email'} test code was created.` });
    }

    if (action === 'verify') {
      const challenge = await verifyAccountOtp({ challengeId: safeText(body.challengeId, 180), code: body.code, purpose: 'account_recovery' });
      const [users, tenants] = await Promise.all([
        selectRows('users', `select=id,tenant_id,email,phone_country_code,phone_number,phone_e164,display_name,role,status,session_generation&id=${eq(challenge.user_id)}&tenant_id=${eq(challenge.tenant_id)}&limit=1`),
        selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at&id=${eq(challenge.tenant_id)}&limit=1`)
      ]);
      const user = users?.[0];
      const tenant = tenants?.[0];
      if (!user?.id || !tenant?.id || String(user.status || '').toLowerCase() !== 'active') return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'The account linked to this recovery code is not available.' });
      const lifecycle = await evaluateTenantAccess(tenant);
      const entitlementContext = await resolveTenantEntitlements(tenant.id);
      const verified = await createVerifiedCustomerSession(event, {
        tenantId: tenant.id,
        userId: user.id,
        role: user.role || 'member',
        clientDeviceId: safeText(body.clientDeviceId, 120),
        deviceName: safeText(body.deviceName, 100),
        deviceType: safeText(body.deviceType, 40),
        platform: safeText(body.platform, 120),
        browser: safeText(body.browser, 180),
        userAgent: safeText(body.userAgent, 500)
      });
      const now = new Date().toISOString();
      await updateRow('users', `id=${eq(user.id)}&tenant_id=${eq(tenant.id)}`, { account_recovery_last_verified_at: now, last_login_at: now, updated_at: now });
      await audit(tenant.id, user.id, 'account_access_recovered', { device_id: verified.device.id, channel: challenge.delivery_channel });
      return jsonResponse(200, {
        ok: true,
        version: APP_VERSION,
        authenticated: true,
        cloudAccess: Boolean(lifecycle.allowed && entitlementContext.effective.features.cloudBackupSync !== false),
        tenantId: tenant.id,
        userId: user.id,
        deviceId: verified.device.id,
        sessionExpiresAt: verified.expiresAt,
        entitlements: entitlementContext.serialized,
        account: {
          displayName: user.display_name || '',
          email: user.email || '',
          phoneCountryCode: user.phone_country_code || '',
          phoneNumber: user.phone_number || '',
          phoneE164: user.phone_e164 || '',
          accountName: tenant.account_name || tenant.name || '',
          planCode: tenant.plan_code || 'personal',
          planStatus: tenant.plan_status || 'active',
          accountStatus: tenant.account_status || 'active',
          tenantRole: tenant.tenant_role || 'primary_owner',
          trialStartedAt: tenant.trial_started_at || null,
          trialEndsAt: tenant.trial_ends_at || null
        },
        message: 'Account access has been restored on this device. Your encrypted vault still requires the correct master password and cannot be decrypted without it.'
      }, { 'set-cookie': verified.cookie });
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown account recovery action.' });
  } catch (error) {
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, message: error.message || 'Account recovery could not be completed.', error: error.status ? undefined : error.message, details: error.details || null });
  }
}
