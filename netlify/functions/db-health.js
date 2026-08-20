import { APP_VERSION, getEnvironmentFlags, getSupabaseStatus, jsonResponse, selectRows } from './_db.js';

export async function handler() {
  const supabase = getSupabaseStatus();

  if (!supabase.configured) {
    return jsonResponse(200, {
      ok: false,
      connected: false,
      app: 'Password-Encrypt',
      version: APP_VERSION,
      checked_at: new Date().toISOString(),
      environment: getEnvironmentFlags(),
      supabase,
      message: 'Cloud backup is not configured yet.'
    });
  }

  try {
    const rows = await selectRows('tenants', 'select=id&limit=1');
    const plans = await selectRows('subscription_plans', 'select=id,feature_flags,entitlement_version,photo_limit&limit=1');
    await selectRows('tenant_subscriptions', 'select=id,entitlements_snapshot,entitlement_overrides&limit=1');
    await selectRows('document_blobs', 'select=id,storage_bytes,blob_kind&limit=1');
    await selectRows('document_blob_chunks', 'select=id,blob_id,chunk_index&limit=1');
    await selectRows('emergency_access_document_chunks', 'select=id,document_id,chunk_index&limit=1');
    await selectRows('sms_delivery_log', 'select=id,status&limit=1');
    await selectRows('customer_email_log', 'select=id,status,email_type&limit=1');
    await selectRows('email_processor_runs', 'select=id,processor_type,status&limit=1');
    await selectRows('admin_notification_settings', 'select=id,recipient_email,enabled,event_flags&limit=1');
    await selectRows('admin_notification_log', 'select=id,event_type,status&limit=1');
    await selectRows('trial_extension_requests', 'select=id,status&limit=1');
    await selectRows('security_rate_limits', 'select=scope,identifier_hash&limit=1');
    await selectRows('security_idempotency_keys', 'select=id,status&limit=1');
    await selectRows('admin_sessions', 'select=id,status&limit=1');
    await selectRows('stripe_webhook_events', 'select=id,status&limit=1');
    const securitySecretsReady = Boolean(process.env.CUSTOMER_SESSION_SECRET && process.env.ADMIN_SESSION_SECRET);
    return jsonResponse(200, {
      ok: securitySecretsReady,
      connected: true,
      schema_ready: true,
      app: 'Password-Encrypt',
      version: APP_VERSION,
      checked_at: new Date().toISOString(),
      environment: getEnvironmentFlags(),
      supabase,
      tenants_sample_count: Array.isArray(rows) ? rows.length : 0,
      subscription_plans_sample_count: Array.isArray(plans) ? plans.length : 0,
      security_ready: securitySecretsReady,
      security: {
        customer_session_secret_configured: Boolean(process.env.CUSTOMER_SESSION_SECRET),
        admin_session_secret_configured: Boolean(process.env.ADMIN_SESSION_SECRET)
      },
      message: securitySecretsReady
        ? 'Supabase connection, Ver-0.050 security schema and secret checks passed.'
        : 'Supabase security schema passed, but dedicated session secrets are not fully configured.'
    });
  } catch (error) {
    const relationMissing = error.details?.code === '42P01' || String(error.message || '').toLowerCase().includes('does not exist');
    const smsMigrationMissing = /sms_delivery_log/i.test(String(error.message || ''));
    const customerEmailMigrationMissing = /customer_email_log/i.test(String(error.message || ''));
    const emailProcessorMigrationMissing = /email_processor_runs/i.test(String(error.message || ''));
    const adminNotificationMigrationMissing = /admin_notification_settings|admin_notification_log|trial_extension_requests/i.test(String(error.message || ''));
    const securityMigrationMissing = /security_rate_limits|security_idempotency_keys|admin_sessions|stripe_webhook_events/i.test(String(error.message || ''));
    const pictureMigrationMissing = /photo_limit|blob_kind|document_blob_chunks|emergency_access_document_chunks/i.test(String(error.message || ''));
    const entitlementMigrationMissing = error.details?.code === '42703'
      || /feature_flags|entitlement_version|entitlements_snapshot|entitlement_overrides|storage_bytes/i.test(String(error.message || ''));
    return jsonResponse(200, {
      ok: false,
      connected: !relationMissing,
      schema_ready: false,
      app: 'Password-Encrypt',
      version: APP_VERSION,
      checked_at: new Date().toISOString(),
      environment: getEnvironmentFlags(),
      supabase,
      error: error.message,
      details: error.details || null,
      message: adminNotificationMigrationMissing
        ? 'Supabase is reachable, but the Ver-1.009 Admin Email Notifications migration is missing. Run the Ver-1.009 migration in Supabase SQL Editor.'
        : pictureMigrationMissing
        ? 'Supabase is reachable, but the Ver-1.008 Picture Upload migration is missing. Run the Ver-1.008 migration in Supabase SQL Editor.'
        : securityMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.050 security tables are missing. Run the Ver-0.050 security migration in Supabase SQL Editor.'
        : emailProcessorMigrationMissing
        ? 'Supabase is reachable, but the automated email processor history table is missing. Run all required Supabase migrations through Ver-0.050 in Supabase SQL Editor.'
        : customerEmailMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.049 automated email delivery table is missing. Run the Ver-0.049 migration in Supabase SQL Editor.'
        : smsMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.047 SMS delivery table is missing. Run the Ver-0.047 migration in Supabase SQL Editor.'
        : entitlementMigrationMissing
        ? 'Supabase is reachable, but the Ver-0.044 entitlement columns are missing. Run the Ver-0.044 migration in Supabase SQL Editor.'
        : relationMissing
          ? 'Supabase is reachable, but the SaaS tables are missing. Run the required Password-Encrypt migrations in Supabase SQL Editor.'
          : 'Supabase connection failed. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    });
  }
}
