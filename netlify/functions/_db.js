export const APP_VERSION = 'Password-Encrypt Ver-0.055D';

export function jsonResponse(statusCode, body, extraHeaders = {}) {
  if (Number(statusCode) >= 500) queueFunctionFailureResponse(statusCode, body);
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
      'cross-origin-resource-policy': 'same-origin',
      ...extraHeaders
    },
    body: JSON.stringify(body, null, 2)
  };
}

function queueFunctionFailureResponse(statusCode, body = {}) {
  const source = String(process.env.NETLIFY_FUNCTION_NAME || process.env.AWS_LAMBDA_FUNCTION_NAME || 'server_function')
    .replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 160);
  const errorCode = String(body?.code || body?.errorCode || 'HTTP_5XX').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120);
  Promise.resolve().then(async () => {
    const { recordOperationalEvent } = await import('./_operations.js');
    await recordOperationalEvent({
      source, eventType: 'function_failure', severity: 'error', errorCode,
      message: 'A server function returned an HTTP 5xx response.',
      metadata: { httpStatus: Number(statusCode || 500) }
    });
  }).catch(() => null);
}


export function getSupabaseConfig() {
  return {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  };
}

export function getEnvironmentFlags() {
  return {
    has_SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    has_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    has_CUSTOMER_SESSION_SECRET: Boolean(process.env.CUSTOMER_SESSION_SECRET),
    has_ADMIN_SESSION_SECRET: Boolean(process.env.ADMIN_SESSION_SECRET),
    has_ADMIN_ACCESS_KEY: Boolean(process.env.ADMIN_ACCESS_KEY),
    has_STRIPE_WEBHOOK_SECRET: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    has_NETLIFY: Boolean(process.env.NETLIFY),
    has_CONTEXT: Boolean(process.env.CONTEXT),
    has_URL: Boolean(process.env.URL),
    has_RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY),
    has_OTP_EMAIL_FROM: Boolean(process.env.OTP_EMAIL_FROM),
    has_OPS_ALERT_EMAIL: Boolean(process.env.OPS_ALERT_EMAIL),
    has_SUPABASE_ACCESS_TOKEN: Boolean(process.env.SUPABASE_ACCESS_TOKEN),
    has_SUPABASE_PROJECT_REF: Boolean(process.env.SUPABASE_PROJECT_REF),
    has_TWILIO_ACCOUNT_SID: Boolean(process.env.TWILIO_ACCOUNT_SID),
    has_TWILIO_AUTH_TOKEN: Boolean(process.env.TWILIO_AUTH_TOKEN),
    has_TWILIO_VERIFY_SERVICE_SID: Boolean(process.env.TWILIO_VERIFY_SERVICE_SID),
    has_TWILIO_MESSAGING_SERVICE_SID: Boolean(process.env.TWILIO_MESSAGING_SERVICE_SID),
    has_TWILIO_FROM_NUMBER: Boolean(process.env.TWILIO_FROM_NUMBER)
  };
}

function supabaseHeaders(extra = {}) {
  const { serviceRoleKey } = getSupabaseConfig();
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
    ...extra
  };
}

export function getSupabaseStatus() {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return {
    configured: Boolean(url && serviceRoleKey),
    url_present: Boolean(url),
    service_role_key_present: Boolean(serviceRoleKey),
    host: url ? new URL(url).host : null
  };
}

export async function supabaseRequest(path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (!url || !serviceRoleKey) {
    const error = new Error('Cloud backup is not configured yet.');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: supabaseHeaders(options.headers || {})
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = text; }
  }

  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || `Supabase REST request failed with HTTP ${response.status}.`);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

export async function selectRows(table, query = 'select=*') {
  return supabaseRequest(`${table}?${query}`, { method: 'GET' });
}

export async function insertRow(table, row) {
  const result = await supabaseRequest(`${table}?select=*`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return Array.isArray(result) ? result[0] : result;
}


export async function updateRow(table, filterQuery, row) {
  const result = await supabaseRequest(`${table}?${filterQuery}&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row)
  });
  return Array.isArray(result) ? result[0] : result;
}

export async function deleteRow(table, filterQuery) {
  const result = await supabaseRequest(`${table}?${filterQuery}&select=*`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });
  return Array.isArray(result) ? result[0] : result;
}

export async function upsertRow(table, row, onConflict) {
  const result = await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(onConflict)}&select=*`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
  return Array.isArray(result) ? result[0] : result;
}

export function parseBody(event) {
  if (!event.body) return {};
  try { return JSON.parse(event.body); }
  catch { return {}; }
}

export function requirePost(event) {
  return event.httpMethod === 'POST';
}

export function publicId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
