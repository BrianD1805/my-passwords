import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId } from './_db.js';
import { clearAdminSession, constantTimeSecretMatch } from './_auth.js';
import { createAdminSession, revokeAdminSession, rotateAdminSession, validateAdminSession } from './_admin-session.js';
import { assertBrowserAction, consumeRateLimit, csrfTokenForSession, requestIpHash, resetRateLimit, securityErrorResponseHeaders } from './_security.js';

async function audit(action, metadata = {}) {
  return insertRow('audit_log', {
    id: publicId('audit'), tenant_id: null, user_id: null, action,
    metadata: { version: APP_VERSION, actor: 'owner_admin', ...metadata }
  }).catch(() => null);
}

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });

  const body = event.httpMethod === 'POST' ? parseBody(event) : {};
  const action = String(body.action || (event.httpMethod === 'GET' ? 'status' : 'login')).trim();

  try {
    if (action === 'status') {
      const validation = await validateAdminSession(event, { touch: true });
      if (!validation.ok) {
        return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, message: 'Enter the admin access key.' });
      }
      const rotated = await rotateAdminSession(event, validation);
      const session = rotated?.session ? { ...validation.session, sessionId: rotated.session.id } : validation.session;
      return jsonResponse(200, {
        ok: true, version: APP_VERSION, authenticated: true,
        csrfToken: csrfTokenForSession(session, 'admin'),
        message: 'Admin session is active.'
      }, rotated?.cookie ? { 'set-cookie': rotated.cookie } : {});
    }

    if (action === 'logout') {
      const validation = await validateAdminSession(event);
      if (validation.ok) {
        assertBrowserAction(event, { session: validation.session, kind: 'admin', csrf: true });
        await revokeAdminSession(validation.session.sessionId, 'admin_logout');
        await audit('owner_admin_logout', {
          admin_session_id: validation.session.sessionId,
          admin_session_issued_at: validation.session.iat ? new Date(Number(validation.session.iat) * 1000).toISOString() : null
        });
      }
      return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, message: 'Admin session ended.' }, {
        'set-cookie': clearAdminSession(event)
      });
    }

    if (action !== 'login') return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown admin authentication action.' });
    assertBrowserAction(event, { csrf: false });
    await consumeRateLimit(event, { scope: 'admin_login_ip', identifier: requestIpHash(event), limit: 5, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });

    const expected = process.env.ADMIN_ACCESS_KEY || '';
    const accessKey = String(body.accessKey || '');
    if (!expected) return jsonResponse(503, { ok: false, version: APP_VERSION, message: 'ADMIN_ACCESS_KEY is not configured in Netlify.' });
    if (!accessKey || !constantTimeSecretMatch(accessKey, expected)) {
      await audit('owner_admin_login_failed', { ip_hash: requestIpHash(event) });
      return jsonResponse(401, { ok: false, version: APP_VERSION, message: 'Admin access key was not accepted.' });
    }

    await resetRateLimit(event, { scope: 'admin_login_ip', identifier: requestIpHash(event) });
    const created = await createAdminSession(event);
    const session = { kind: 'admin', role: 'owner_admin', sessionId: created.session.id };
    await audit('owner_admin_login', { admin_session_id: created.session.id, ip_hash: requestIpHash(event) });

    return jsonResponse(200, {
      ok: true, version: APP_VERSION, authenticated: true,
      csrfToken: csrfTokenForSession(session, 'admin'),
      message: 'Admin access confirmed.'
    }, { 'set-cookie': created.cookie });
  } catch (error) {
    return jsonResponse(error.status || 500, {
      ok: false, version: APP_VERSION, code: error.code || 'ADMIN_AUTH_FAILED',
      message: error.message || 'Admin authentication failed.'
    }, securityErrorResponseHeaders(error));
  }
}
