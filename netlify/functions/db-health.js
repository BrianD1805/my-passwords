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
    const plans = await selectRows('subscription_plans', 'select=id,feature_flags,entitlement_version&limit=1');
    await selectRows('tenant_subscriptions', 'select=id,entitlements_snapshot,entitlement_overrides&limit=1');
    await selectRows('document_blobs', 'select=id,storage_bytes&limit=1');
    await selectRows('sms_delivery_log', 'select=id,status&limit=1');
    await selectRows('customer_email_log', 'select=id,status,email_type&limit=1');
    await selectRows('email_processor_runs', 'select=id,processor_type,status&limit=1');
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
    const smsMigrationMissing = /sms_delivery_log/i.test(String(error.message || ''));
    const customerEmailMigrationMissing = /customer_email_log/i.test(String(error.message || ''));
    const emailProcessorMigrationMissing = /email_processor_runs/i.test(String(error.message || ''));
    const entitlementMigrationMissing = error.details?.code === '42703'
      || /feature_flags|entitlement_version|entitlements_snapshot|entitlement_overrides|storage_bytes/i.test(String(error.message || ''));
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
      message: emailProcessorMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.049A automated email processor history table is missing. Run the Ver-0.049A migration in Supabase SQL Editor.'
        : customerEmailMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.049 automated email delivery table is missing. Run the Ver-0.049 migration in Supabase SQL Editor.'
        : smsMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.047 SMS delivery table is missing. Run the Ver-0.047 migration in Supabase SQL Editor.'
        : entitlementMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.044 entitlement columns are missing. Run the Ver-0.044 migration in Supabase SQL Editor.'
        : relationMissing
          ? 'Supabase is reachable, but the SaaS tables are missing. Run the required My Passwords migrations in Supabase SQL Editor.'
          : 'Supabase connection failed. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    });
  }
}
