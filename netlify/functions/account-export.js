import { APP_VERSION, jsonResponse, selectRows } from './_db.js';
import { clearCustomerSession } from './_auth.js';
import { validateCustomerSession } from './_account-session.js';
import { loadTenantSubscription } from './_trial.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }

export async function handler(event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET required.' });
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code, message: validation.message }, { 'set-cookie': clearCustomerSession(event) });
  const { tenantId, userId } = validation.session;

  try {
    const [users, tenants, devices, sessions, deletion, invitations, requests, audit, snapshots, documents, smsDeliveries, subscription] = await Promise.all([
      selectRows('users', `select=id,email,display_name,role,status,phone_country_code,phone_number,phone_e164,email_verified,phone_verified,onboarding_completed_at,last_login_at,created_at,updated_at&id=${eq(userId)}&tenant_id=${eq(tenantId)}&limit=1`),
      selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at,deletion_status,deletion_requested_at,deletion_scheduled_for,created_at,updated_at&id=${eq(tenantId)}&limit=1`),
      selectRows('account_devices', `select=id,device_name,device_type,platform,browser,first_verified_at,last_verified_at,last_seen_at,revoked_at,revoked_reason,created_at&user_id=${eq(userId)}&tenant_id=${eq(tenantId)}&order=last_seen_at.desc`).catch(() => []),
      selectRows('account_sessions', `select=id,device_id,status,issued_at,expires_at,renewed_at,last_seen_at,revoked_at,revoked_reason&user_id=${eq(userId)}&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=100`).catch(() => []),
      selectRows('account_deletion_requests', `select=id,status,requested_at,scheduled_for,cancelled_at,completed_at,reason&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=20`).catch(() => []),
      selectRows('emergency_access_invitations', `select=id,contact_name,contact_email,contact_phone,relationship,waiting_period,access_scope,status,sent_at,accepted_at,declined_at,cancelled_at,expires_at,created_at,updated_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc`).catch(() => []),
      selectRows('emergency_access_requests', `select=id,invitation_id,contact_email,contact_name,waiting_period,access_scope,status,requested_at,waiting_ends_at,owner_notified_at,cancelled_at,released_at,created_at,updated_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc`).catch(() => []),
      selectRows('audit_log', `select=id,action,metadata,created_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc&limit=250`).catch(() => []),
      selectRows('vault_sync_snapshots', `select=id,item_count,client_updated_at,base_snapshot_id,device_id,device_type,created_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc&limit=100`).catch(() => []),
      selectRows('document_blobs', `select=id,file_name,file_type,file_extension,file_size,storage_bytes,created_at,updated_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=updated_at.desc`).catch(() => []),
      selectRows('sms_delivery_log', `select=id,provider,purpose,destination_masked,status,error_code,sent_at,delivered_at,failed_at,created_at&tenant_id=${eq(tenantId)}&user_id=${eq(userId)}&order=created_at.desc&limit=100`).catch(() => []),
      loadTenantSubscription(tenantId).catch(() => null)
    ]);

    const exportData = {
      export: {
        product: 'My Passwords',
        version: APP_VERSION,
        createdAt: new Date().toISOString(),
        scope: 'Personal account information and encrypted-vault metadata. Decrypted vault contents and master passwords are never included.'
      },
      account: { user: users?.[0] || null, tenant: tenants?.[0] || null },
      subscription: subscription || null,
      verifiedDevices: devices || [],
      accountSessions: sessions || [],
      accountDeletionRequests: deletion || [],
      emergencyAccess: { invitations: invitations || [], requests: requests || [] },
      encryptedVaultMetadata: { snapshots: snapshots || [], documents: documents || [] },
      accountActivity: audit || [],
      smsVerificationHistory: smsDeliveries || [],
      securityNotice: 'The master password is not stored by My Passwords and cannot be exported, recovered or reset. Account recovery restores access to account services only; it cannot decrypt a vault without the correct master password.'
    };
    const date = new Date().toISOString().slice(0, 10);
    return {
      statusCode: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="my-passwords-account-export-${date}.json"`,
        'cache-control': 'no-store'
      },
      body: JSON.stringify(exportData, null, 2)
    };
  } catch (error) {
    return jsonResponse(500, { ok: false, version: APP_VERSION, message: 'Could not prepare the account information export.', error: error.message, details: error.details || null });
  }
}
