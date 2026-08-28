import { APP_VERSION, jsonResponse, parseBody, selectRows, updateRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';
import { sendCustomerLifecycleEmail } from './_customer-email.js';
import { sendAdminNotification } from './_admin-notification.js';
import { assertBrowserAction } from './_security.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verified customer session required.' });
  const session = validation.session;
  try { assertBrowserAction(event, { session, kind: 'customer', csrf: true }); }
  catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }

  const body = parseBody(event);
  try {
    const [userRows, tenantRows] = await Promise.all([
      selectRows('users', `select=id,tenant_id,email,phone_e164,display_name,email_verified,phone_verified,welcome_email_sent_at&tenant_id=${eq(session.tenantId)}&id=${eq(session.userId)}&limit=1`),
      selectRows('tenants', `select=id,account_name,name,plan_code,plan_status,trial_ends_at&id=${eq(session.tenantId)}&limit=1`)
    ]);
    const user = userRows?.[0];
    const tenant = tenantRows?.[0];
    if (!user?.id || !tenant?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Verified account details could not be loaded.' });

    let welcome = { sent: false, skipped: true };
    if (user.email_verified && user.email && !user.welcome_email_sent_at) {
      const trialActive = String(tenant.plan_status || '').toLowerCase().includes('trial');
      welcome = await sendCustomerLifecycleEmail({
        tenantId: tenant.id,
        userId: user.id,
        to: user.email,
        type: trialActive ? 'welcome_trial_started' : 'welcome_account_activated',
        idempotencyKey: `welcome:${tenant.id}`,
        context: {
          displayName: user.display_name || '',
          accountEmail: user.email || '',
          accountPhone: user.phone_e164 || '',
          accountName: tenant.account_name || tenant.name || 'My Private Vault',
          trialEndsAt: tenant.trial_ends_at || ''
        },
        metadata: { source: String(body.source || 'post_verification').slice(0, 80) }
      }).catch((error) => ({ sent: false, reason: error.message || 'Welcome email could not be sent.' }));
      if (welcome.sent) {
        await updateRow('users', `id=${eq(user.id)}&tenant_id=${eq(tenant.id)}`, { welcome_email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).catch(() => null);
      }
    }

    const verificationMethod = user.email_verified && user.phone_verified
      ? 'SMS OTP + Email OTP'
      : user.email_verified ? 'Email OTP' : user.phone_verified ? 'SMS OTP' : 'Verified session';
    const admin = await sendAdminNotification({
      type: 'new_client_onboarded',
      tenantId: tenant.id,
      userId: user.id,
      idempotencyKey: `new_client_onboarded:${tenant.id}`,
      context: {
        source: String(body.source || 'post_verification').slice(0, 80),
        displayName: user.display_name || '',
        email: user.email || '',
        phone: user.phone_e164 || '',
        emailVerified: Boolean(user.email_verified),
        phoneVerified: Boolean(user.phone_verified),
        verificationMethod
      }
    }).catch((error) => ({ sent: false, reason: error.message || 'Admin notification could not be sent.' }));

    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      welcomeEmailSent: Boolean(welcome.sent),
      adminNotificationSent: Boolean(admin.sent)
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, code: 'POST_VERIFICATION_NOTIFICATION_FAILED', message: 'Verification completed, but follow-up notifications could not be processed.', error: error.message || '' });
  }
}
