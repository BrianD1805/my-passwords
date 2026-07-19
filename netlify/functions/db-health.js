import { APP_VERSION, getEnvironmentFlags, getSupabaseStatus, jsonResponse, selectRows } from './_db.js';

export async function handler() {
  const supabase = getSupabaseStatus();

  if (!supabase.configured) {
    return jsonResponse(200, {
      ok: false,
      connected: false,
      app: 'My Passwords',
      version: APP_VERSION,
      checked_at: new Date().toISOString(),
      environment: getEnvironmentFlags(),
      supabase,
      message: 'Cloud backup is not configured yet.'
    });
  }

  try {
    const rows = await selectRows('tenants', 'select=id&limit=1');
    const plans = await selectRows('subscription_plans', 'select=id&limit=1');
    return jsonResponse(200, {
      ok: true,
      connected: true,
      schema_ready: true,
      app: 'My Passwords',
      version: APP_VERSION,
      checked_at: new Date().toISOString(),
      environment: getEnvironmentFlags(),
      supabase,
      tenants_sample_count: Array.isArray(rows) ? rows.length : 0,
      subscription_plans_sample_count: Array.isArray(plans) ? plans.length : 0,
      message: 'Supabase connection and schema check passed.'
    });
  } catch (error) {
    const relationMissing = error.details?.code === '42P01' || String(error.message || '').toLowerCase().includes('does not exist');
    return jsonResponse(200, {
      ok: false,
      connected: !relationMissing,
      schema_ready: false,
      app: 'My Passwords',
      version: APP_VERSION,
      checked_at: new Date().toISOString(),
      environment: getEnvironmentFlags(),
      supabase,
      error: error.message,
      details: error.details || null,
      message: relationMissing
        ? 'Supabase is reachable, but the Ver-0.039 SaaS tables are missing. Run the Ver-0.039 and Ver-0.039A migrations in Supabase SQL Editor.'
        : 'Supabase connection failed. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    });
  }
}
