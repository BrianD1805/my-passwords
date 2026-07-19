import { APP_VERSION, insertRow, jsonResponse, parseBody, publicId } from './_db.js';
import { clearAdminSession, constantTimeSecretMatch, issueAdminSession, readAdminSession } from './_auth.js';

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });

  const body = event.httpMethod === 'POST' ? parseBody(event) : {};
  const action = String(body.action || (event.httpMethod === 'GET' ? 'status' : 'login')).trim();

  if (action === 'logout') {
    return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: false, message: 'Admin session ended.' }, {
      'set-cookie': clearAdminSession(event)
    });
  }

  if (action === 'status') {
    const session = readAdminSession(event);
    return jsonResponse(200, {
      ok: true,
      version: APP_VERSION,
      authenticated: Boolean(session),
      message: session ? 'Admin session is active.' : 'Enter the admin access key.'
    });
  }

  const expected = process.env.ADMIN_ACCESS_KEY || '';
  const accessKey = String(body.accessKey || '');
  if (!expected) return jsonResponse(503, { ok: false, version: APP_VERSION, message: 'ADMIN_ACCESS_KEY is not configured in Netlify.' });
  if (!accessKey || !constantTimeSecretMatch(accessKey, expected)) {
    return jsonResponse(401, { ok: false, version: APP_VERSION, message: 'Admin access key was not accepted.' });
  }

  try {
    await insertRow('audit_log', {
      id: publicId('audit'),
      tenant_id: null,
      user_id: null,
      action: 'owner_admin_login',
      metadata: { version: APP_VERSION }
    }).catch(() => null);
  } catch {
    // Admin authentication must not fail only because audit logging is unavailable.
  }

  return jsonResponse(200, { ok: true, version: APP_VERSION, authenticated: true, message: 'Admin access confirmed.' }, {
    'set-cookie': issueAdminSession(event)
  });
}
