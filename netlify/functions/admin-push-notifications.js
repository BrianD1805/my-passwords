import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateAdminSession } from './_admin-session.js';
import { assertBrowserAction, consumeRateLimit, securityErrorResponseHeaders } from './_security.js';
import { logPushDelivery, pushConfiguration, sendPushToAll } from './_push.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 500) { return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max); }
function safeTarget(value) {
  const url = safeText(value || '/vault', 300);
  return url.startsWith('/') && !url.startsWith('//') ? url : '/vault';
}

async function audit(session, action, metadata = {}) {
  return insertRow('audit_log', {
    id: publicId('audit'), tenant_id: null, user_id: null, action,
    metadata: {
      version: APP_VERSION,
      actor: 'owner_admin',
      admin_session_issued_at: session?.iat ? new Date(Number(session.iat) * 1000).toISOString() : null,
      ...metadata
    }
  }).catch(() => null);
}

async function loadAdminPushData() {
  const [templates, subscriptions, logs] = await Promise.all([
    selectRows('push_notification_templates', 'select=template_key,display_name,description,title,body,target_url,is_enabled,updated_by,created_at,updated_at&order=display_name.asc'),
    selectRows('push_subscriptions', 'select=id,tenant_id,user_id,status,last_success_at,last_failure_at,failure_count,disabled_at,created_at,updated_at&order=updated_at.desc&limit=5000'),
    selectRows('push_notification_log', 'select=id,tenant_id,user_id,notification_type,template_key,title,body_preview,target_url,trigger_source,subscriptions_targeted,delivered,failed,disabled_endpoints,metadata,created_at&order=created_at.desc&limit=100')
  ]);
  const active = (subscriptions || []).filter((row) => row.status === 'active');
  const users = new Set(active.map((row) => row.user_id).filter(Boolean));
  const tenants = new Set(active.map((row) => row.tenant_id).filter(Boolean));
  return {
    templates: templates || [],
    recentLogs: logs || [],
    summary: {
      activeSubscriptions: active.length,
      pushEnabledUsers: users.size,
      pushEnabledAccounts: tenants.size,
      disabledSubscriptions: (subscriptions || []).filter((row) => row.status === 'disabled').length,
      failedActiveSubscriptions: active.filter((row) => Number(row.failure_count || 0) > 0).length
    },
    configuration: pushConfiguration()
  };
}

export async function handler(event) {
  const validation = await validateAdminSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'ADMIN_SESSION_REQUIRED', message: 'Admin sign-in is required.' });
  const session = validation.session;

  if (event.httpMethod === 'GET') {
    try {
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await loadAdminPushData()) });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, code: 'ADMIN_PUSH_LOAD_FAILED', message: 'Push notification Admin data could not be loaded. Run the Ver-1.001 Supabase migration first.', error: error.message });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const body = parseBody(event);
  const action = safeText(body.action, 80);

  try {
    assertBrowserAction(event, { session, kind: 'admin', csrf: true });

    if (action === 'save_template') {
      const templateKey = safeText(body.templateKey, 100);
      const rows = await selectRows('push_notification_templates', `select=template_key&template_key=${eq(templateKey)}&limit=1`);
      if (!rows?.[0]?.template_key) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Push notification template was not found.' });
      const title = safeText(body.title, 80);
      const notificationBody = safeText(body.body, 220);
      if (!title || !notificationBody) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Notification title and text are required.' });
      const now = new Date().toISOString();
      await updateRow('push_notification_templates', `template_key=${eq(templateKey)}`, {
        title,
        body: notificationBody,
        target_url: safeTarget(body.targetUrl),
        is_enabled: body.isEnabled !== false,
        updated_by: 'owner_admin',
        updated_at: now
      });
      await audit(session, 'admin_push_notification_template_saved', { template_key: templateKey });
      return jsonResponse(200, { ok: true, version: APP_VERSION, ...(await loadAdminPushData()), message: 'Push notification text saved.' });
    }

    if (action === 'send_broadcast') {
      await consumeRateLimit(event, { scope: 'admin_push_broadcast', identifier: session.sessionId || 'admin', limit: 20, windowSeconds: 60 * 60, blockSeconds: 60 * 60 });
      const config = pushConfiguration();
      if (!config.configured) return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'PUSH_NOT_CONFIGURED', message: 'Push delivery is not configured. Add the VAPID environment variables in Netlify first.' });
      const title = safeText(body.title, 80);
      const notificationBody = safeText(body.body, 220);
      if (!title || !notificationBody) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Broadcast title and text are required.' });
      const notification = { title, body: notificationBody, url: safeTarget(body.targetUrl), tag: `admin-broadcast-${Date.now()}`, requireInteraction: false };
      const summary = await sendPushToAll({ notification, options: { urgency: 'normal', ttl: 86400 } });
      await logPushDelivery({ notificationType: 'broadcast', notification, triggerSource: 'owner_admin', summary, metadata: { admin_broadcast: true } });
      await audit(session, 'admin_push_notification_broadcast_sent', { subscriptions_targeted: summary.targeted, delivered: summary.delivered, failed: summary.failed, disabled_endpoints: summary.disabled });
      return jsonResponse(200, { ok: true, version: APP_VERSION, summary, ...(await loadAdminPushData()), message: `Push broadcast finished: ${summary.delivered} delivered, ${summary.failed} failed.` });
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown push notification Admin action.' });
  } catch (error) {
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, code: error.code || 'ADMIN_PUSH_FAILED', message: error.status ? error.message : 'Push notification Admin action failed.', error: error.status ? undefined : error.message }, securityErrorResponseHeaders(error));
  }
}
