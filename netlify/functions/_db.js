export const APP_VERSION = 'My Passwords Ver-0.013A';

export function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body, null, 2)
  };
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
    has_NETLIFY: Boolean(process.env.NETLIFY),
    has_CONTEXT: Boolean(process.env.CONTEXT),
    has_URL: Boolean(process.env.URL)
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
    const error = new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.');
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
