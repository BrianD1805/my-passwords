import { APP_VERSION, jsonResponse, parseBody, publicId, selectRows, updateRow, upsertRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';
import { assertBrowserAction, consumeRateLimit, securityErrorResponseHeaders } from './_security.js';
import { pushConfiguration, pushEndpointHash, sanitisePushSubscription } from './_push.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 500) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }

async function statusFor(session) {
  const config = pushConfiguration();
  const rows = await selectRows('push_subscriptions', `select=id,endpoint_hash,status,last_success_at,last_failure_at,failure_count,disabled_at,created_at,updated_at&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&status=eq.active&order=updated_at.desc&limit=50`).catch(() => []);
  return {
    configured: config.configured,
    publicKey: config.publicKey,
    activeSubscriptions: rows || [],
    activeCount: rows?.length || 0
  };
}

export async function handler(event) {
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verify this device to continue.' });
  const session = validation.session;

  if (event.httpMethod === 'GET') {
    try {
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await statusFor(session)) });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, code: 'PUSH_STATUS_FAILED', message: 'Push notification status could not be loaded.', error: error.message });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const body = parseBody(event);
  const action = safeText(body.action, 80);

  try {
    assertBrowserAction(event, { session, kind: 'customer', csrf: true });
    await consumeRateLimit(event, { scope: 'push_subscription', identifier: session.sessionId || session.userId, limit: 30, windowSeconds: 15 * 60, blockSeconds: 15 * 60 });

    if (action === 'subscribe') {
      const config = pushConfiguration();
      if (!config.configured) return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'PUSH_NOT_CONFIGURED', message: 'Push notifications are not configured on the server yet.' });
      const subscription = sanitisePushSubscription(body.subscription || {});
      if (!subscription) return jsonResponse(400, { ok: false, version: APP_VERSION, code: 'INVALID_PUSH_SUBSCRIPTION', message: 'The browser returned an invalid push subscription.' });
      const now = new Date().toISOString();
      const row = await upsertRow('push_subscriptions', {
        id: publicId('push_sub'),
        tenant_id: session.tenantId,
        user_id: session.userId,
        endpoint: subscription.endpoint,
        endpoint_hash: pushEndpointHash(subscription.endpoint),
        p256dh: subscription.p256dh,
        auth_secret: subscription.authSecret,
        user_agent: safeText(event?.headers?.['user-agent'] || event?.headers?.['User-Agent'], 500),
        device_id: session.deviceId || null,
        status: 'active',
        disabled_at: null,
        disabled_reason: null,
        failure_count: 0,
        updated_at: now
      }, 'endpoint');
      return jsonResponse(200, { ok: true, version: APP_VERSION, subscriptionId: row?.id || '', ...(await statusFor(session)), message: 'Push notifications are enabled on this device.' });
    }

    if (action === 'unsubscribe') {
      const endpoint = safeText(body.endpoint, 1800);
      if (!endpoint) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Push endpoint is required.' });
      const rows = await selectRows('push_subscriptions', `select=id&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&endpoint=${eq(endpoint)}&limit=1`).catch(() => []);
      const row = rows?.[0];
      if (row?.id) {
        const now = new Date().toISOString();
        await updateRow('push_subscriptions', `id=${eq(row.id)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}`, {
          status: 'disabled', disabled_at: now, disabled_reason: 'Disabled by customer on this device.', updated_at: now
        });
      }
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await statusFor(session)), message: 'Push notifications are disabled on this device.' });
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown push notification action.' });
  } catch (error) {
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, code: error.code || 'PUSH_SUBSCRIPTION_FAILED', message: error.status ? error.message : 'Push notification settings could not be saved.', error: error.status ? undefined : error.message }, securityErrorResponseHeaders(error));
  }
}
