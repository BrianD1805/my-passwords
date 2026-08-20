import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';
import { assertBrowserAction, consumeRateLimit, requestIpHash } from './_security.js';
import { sendAdminNotification } from './_admin-notification.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 500) { return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });

  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'SESSION_REQUIRED', message: 'Verify this device before requesting a trial extension.' });
  const session = validation.session;
  try { assertBrowserAction(event, { session, kind: 'customer', csrf: true }); } catch (error) {
    return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code || 'SECURE_REQUEST_REJECTED', message: error.message });
  }

  try {
    await consumeRateLimit(event, { scope: 'trial_extension_request_ip', identifier: requestIpHash(event), limit: 5, windowSeconds: 24 * 60 * 60, blockSeconds: 24 * 60 * 60 });
    await consumeRateLimit(event, { scope: 'trial_extension_request_user', identifier: session.userId, limit: 3, windowSeconds: 7 * 24 * 60 * 60, blockSeconds: 24 * 60 * 60 });

    const body = parseBody(event);
    const reason = safeText(body.reason, 500);
    const [tenantRows, userRows, subscriptionRows, pendingRows] = await Promise.all([
      selectRows('tenants', `select=id,account_name,name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at&id=${eq(session.tenantId)}&limit=1`),
      selectRows('users', `select=id,tenant_id,email,phone_e164,display_name,email_verified,phone_verified&id=${eq(session.userId)}&tenant_id=${eq(session.tenantId)}&limit=1`),
      selectRows('tenant_subscriptions', `select=id,tenant_id,plan_code,status,billing_interval,provider,provider_subscription_id,trial_started_at,trial_ends_at&tenant_id=${eq(session.tenantId)}&limit=1`).catch(() => []),
      selectRows('trial_extension_requests', `select=id,status,requested_at&tenant_id=${eq(session.tenantId)}&status=${eq('pending')}&limit=1`).catch(() => [])
    ]);
    const tenant = tenantRows?.[0];
    const user = userRows?.[0];
    const subscription = subscriptionRows?.[0] || null;
    if (!tenant?.id || !user?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Your account could not be loaded.' });
    const founder = ['founder_private', 'private_founder'].includes(String(tenant.plan_code || '').toLowerCase()) || String(tenant.plan_status || '').toLowerCase() === 'founder_active' || String(tenant.tenant_role || '').toLowerCase() === 'founder_first_tenant';
    if (founder) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Founder access does not expire, so a trial extension is not required.' });
    if (pendingRows?.[0]?.id) {
      const requestedAt = new Date(pendingRows[0].requested_at || 0).getTime();
      const stale = Number.isFinite(requestedAt) && requestedAt > 0 && requestedAt < Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (!stale) return jsonResponse(200, { ok: true, version: APP_VERSION, alreadyPending: true, message: 'Your trial extension request has already been sent to Password-Encrypt Admin.' });
      await updateRow('trial_extension_requests', `id=${eq(pendingRows[0].id)}&tenant_id=${eq(session.tenantId)}`, { status: 'cancelled', reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).catch(() => null);
    }

    const subscriptionStatus = String(subscription?.status || tenant.plan_status || '').toLowerCase();
    const hasTrial = Boolean(tenant.trial_started_at || tenant.trial_ends_at || subscription?.trial_started_at || subscription?.trial_ends_at || subscriptionStatus.includes('trial'));
    if (!hasTrial) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'There is no trial on this account to extend.' });
    if (subscription?.provider === 'stripe' && subscription?.provider_subscription_id && subscriptionStatus === 'active') {
      return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'This account already has an active paid subscription, so a trial extension is not required.' });
    }

    const now = new Date().toISOString();
    const request = await insertRow('trial_extension_requests', {
      id: publicId('trialrequest'), tenant_id: session.tenantId, user_id: session.userId,
      status: 'pending', reason, trial_ends_at: tenant.trial_ends_at || subscription?.trial_ends_at || null,
      requested_at: now, reviewed_at: null,
      metadata: { version: APP_VERSION, source: 'customer_plan_and_billing' }, created_at: now, updated_at: now
    });

    const notification = await sendAdminNotification({
      type: 'trial_extension_requested', tenantId: session.tenantId, userId: session.userId,
      idempotencyKey: `trial_extension_requested:${request.id}`,
      context: { source: 'trial_extension_request', reason, trialEndsAt: tenant.trial_ends_at || subscription?.trial_ends_at || '' }
    }).catch((error) => ({ sent: false, skipped: false, reason: error.message || 'Admin notification failed.' }));

    await insertRow('audit_log', {
      id: publicId('audit'), tenant_id: session.tenantId, user_id: session.userId,
      action: 'trial_extension_requested',
      metadata: { version: APP_VERSION, request_id: request.id, admin_email_sent: Boolean(notification?.sent) },
      created_at: now
    }).catch(() => null);

    return jsonResponse(200, {
      ok: true, version: APP_VERSION, requestId: request.id,
      message: 'Your trial extension request has been sent to Password-Encrypt Admin. You will be contacted if the trial is extended.'
    });
  } catch (error) {
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, message: error.message || 'The trial extension request could not be sent.', details: error.details || null });
  }
}
