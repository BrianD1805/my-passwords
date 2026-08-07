import { APP_VERSION, jsonResponse, parseBody } from './_db.js';
import { getCustomerAccess } from './_session.js';
import { assertBrowserAction } from './_security.js';
import { recordOperationalEvent, sanitiseOperationalText } from './_operations.js';

function safeScript(value) {
  try {
    const url = new URL(String(value || ''), 'https://local.invalid');
    return sanitiseOperationalText(url.pathname.split('/').pop() || '', 120);
  } catch {
    return '';
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'POST required.' });
  let access;
  try { access = await getCustomerAccess(event); }
  catch { return jsonResponse(204, { ok: true, version: APP_VERSION }); }
  if (!access?.ok) return jsonResponse(204, { ok: true, version: APP_VERSION });
  try { assertBrowserAction(event, { session: access.session, kind: 'customer', csrf: true }); }
  catch { return jsonResponse(204, { ok: true, version: APP_VERSION }); }

  const body = parseBody(event);
  const kind = ['window_error', 'unhandled_rejection'].includes(String(body.kind || '')) ? String(body.kind) : 'client_runtime_error';
  await recordOperationalEvent({
    source: 'browser', eventType: 'client_runtime_error', severity: 'error', errorCode: sanitiseOperationalText(body.errorName || 'CLIENT_RUNTIME_ERROR', 100),
    message: 'An authenticated browser runtime error was reported without exception text or vault content.',
    tenantId: access.session.tenantId, userId: access.session.userId,
    metadata: {
      kind, script: safeScript(body.script), line: Math.max(0, Number(body.line || 0)), column: Math.max(0, Number(body.column || 0)),
      route: sanitiseOperationalText(String(body.route || '').split('?')[0].split('#')[0], 120), online: Boolean(body.online)
    }
  });
  return jsonResponse(200, { ok: true, version: APP_VERSION });
}
