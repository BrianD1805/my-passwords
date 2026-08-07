import { APP_VERSION, deleteRow, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { readAdminSession } from './_auth.js';
import { createAccountOtp, maskEmail } from './_account-otp.js';
import { adminEmailTypesForCustomer, sendAdminAccountEmail } from './_admin-email.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function safeText(value, max = 2000) { return String(value || '').trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max); }
function parseJson(value) { if (!value) return {}; if (typeof value === 'object') return value; try { return JSON.parse(value); } catch { return {}; } }
function dateValue(value) { const time = value ? new Date(value).getTime() : 0; return Number.isFinite(time) ? time : 0; }
function titleCase(value) { return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

async function safeSelect(table, query) {
  return selectRows(table, query).catch(() => []);
}

async function audit(session, action, metadata = {}) {
  return insertRow('audit_log', {
    id: publicId('audit'),
    tenant_id: metadata.tenant_id || null,
    user_id: null,
    action,
    metadata: {
      version: APP_VERSION,
      actor: 'owner_admin',
      admin_session_issued_at: session?.iat ? new Date(Number(session.iat) * 1000).toISOString() : null,
      ...metadata
    }
  }).catch(() => null);
}

function timelineEntry({ id, source, type, status = 'recorded', title, detail = '', occurredAt, metadata = {} }) {
  return { id, source, type, status, title, detail, occurredAt, metadata };
}

function buildTimeline({ tenant, users, subscription, billingEvents, syncEvents, snapshots, sessions, otpChallenges, deletionRequests, auditRows, notes, emailLog, customerEmailLog }) {
  const entries = [];
  entries.push(timelineEntry({ id: `tenant-${tenant.id}`, source: 'account', type: 'account_created', status: tenant.account_status || 'active', title: 'Customer account created', detail: tenant.account_name || tenant.name || '', occurredAt: tenant.created_at }));

  for (const user of users) {
    if (user.created_at) entries.push(timelineEntry({ id: `user-${user.id}`, source: 'account', type: 'user_created', status: user.status || 'active', title: `${user.display_name || 'Account owner'} added`, detail: user.email || '', occurredAt: user.created_at }));
    if (user.last_login_at) entries.push(timelineEntry({ id: `login-${user.id}`, source: 'sign_in', type: 'last_sign_in', status: 'success', title: 'Successful account sign-in', detail: user.display_name || user.email || '', occurredAt: user.last_login_at }));
  }

  if (subscription?.created_at) entries.push(timelineEntry({ id: `subscription-created-${subscription.id}`, source: 'subscription', type: 'subscription_created', status: subscription.status || 'recorded', title: 'Subscription record created', detail: `${subscription.plan_code || tenant.plan_code || ''} ${subscription.billing_interval || ''}`.trim(), occurredAt: subscription.created_at }));
  if (subscription?.trial_started_at) entries.push(timelineEntry({ id: `trial-start-${subscription.id}`, source: 'trial', type: 'trial_started', status: 'success', title: 'Trial started', detail: subscription.plan_code || tenant.plan_code || '', occurredAt: subscription.trial_started_at }));
  if (subscription?.trial_ends_at) entries.push(timelineEntry({ id: `trial-end-${subscription.id}`, source: 'trial', type: 'trial_end_scheduled', status: subscription.status || 'recorded', title: 'Trial end date set', detail: 'Scheduled trial end', occurredAt: subscription.trial_ends_at }));

  for (const event of billingEvents) entries.push(timelineEntry({
    id: `billing-${event.id}`, source: 'billing', type: event.event_type, status: event.status || 'recorded',
    title: titleCase(event.event_type || 'Billing event'),
    detail: event.amount_minor ? `${String(event.currency || 'GBP').toUpperCase()} ${(Number(event.amount_minor) / 100).toFixed(2)}` : (parseJson(event.metadata).message || ''),
    occurredAt: event.occurred_at || event.created_at, metadata: parseJson(event.metadata)
  }));

  for (const event of syncEvents) entries.push(timelineEntry({
    id: `sync-${event.id}`, source: 'sync', type: event.event_type, status: event.status || 'recorded',
    title: titleCase(event.event_type || 'Sync event'), detail: event.message || `${event.item_count || 0} item(s)`, occurredAt: event.created_at,
    metadata: { ...parseJson(event.metadata), item_count: event.item_count, device_id: event.device_id }
  }));

  for (const snapshot of snapshots.slice(0, 10)) entries.push(timelineEntry({
    id: `snapshot-${snapshot.id}`, source: 'backup', type: 'backup_snapshot', status: 'success', title: 'Encrypted backup recorded',
    detail: `${snapshot.item_count || 0} encrypted item(s)`, occurredAt: snapshot.created_at,
    metadata: { snapshot_id: snapshot.id, client_updated_at: snapshot.client_updated_at, device_id: snapshot.device_id, device_type: snapshot.device_type }
  }));

  for (const session of sessions) entries.push(timelineEntry({
    id: `session-${session.id}`, source: 'sign_in', type: 'account_session', status: session.status || 'recorded',
    title: session.status === 'revoked' ? 'Account session revoked' : 'Verified account session',
    detail: session.revoked_reason || `Expires ${session.expires_at || ''}`.trim(), occurredAt: session.issued_at || session.created_at,
    metadata: { session_id: session.id, device_id: session.device_id, last_seen_at: session.last_seen_at, expires_at: session.expires_at }
  }));

  for (const challenge of otpChallenges) entries.push(timelineEntry({
    id: `otp-${challenge.id}`, source: 'verification', type: challenge.purpose || 'verification', status: challenge.status || 'recorded',
    title: `${titleCase(challenge.purpose || 'Account')} verification`, detail: `${challenge.delivery_channel || 'contact'} · ${challenge.destination_masked || ''}`.trim(),
    occurredAt: challenge.verified_at || challenge.created_at, metadata: { attempts: challenge.attempts, expires_at: challenge.expires_at }
  }));

  for (const request of deletionRequests) entries.push(timelineEntry({
    id: `deletion-${request.id}`, source: 'deletion', type: 'account_deletion', status: request.status || 'recorded',
    title: `Account deletion ${titleCase(request.status || 'requested')}`, detail: request.reason || '', occurredAt: request.completed_at || request.cancelled_at || request.requested_at || request.created_at,
    metadata: { scheduled_for: request.scheduled_for }
  }));

  for (const row of auditRows) {
    if (row.action === 'admin_customer_detail_viewed' || row.action === 'admin_customer_note_added' || row.action === 'admin_account_email_sent' || row.action === 'admin_account_email_failed') continue;
    const metadata = parseJson(row.metadata);
    entries.push(timelineEntry({
      id: `audit-${row.id}`, source: String(row.action || '').includes('admin') || metadata.actor === 'owner_admin' ? 'admin' : 'audit',
      type: row.action, status: 'recorded', title: titleCase(row.action || 'Account event'), detail: metadata.message || '', occurredAt: row.created_at, metadata
    }));
  }

  for (const note of notes) entries.push(timelineEntry({ id: `note-${note.id}`, source: 'admin', type: 'admin_note', status: 'recorded', title: 'Admin note added', detail: note.note, occurredAt: note.created_at, metadata: { created_by: note.created_by } }));
  for (const email of emailLog) entries.push(timelineEntry({ id: `email-${email.id}`, source: 'email', type: email.email_type, status: email.status || 'sent', title: `${titleCase(email.email_type)} email`, detail: email.recipient_masked || '', occurredAt: email.created_at, metadata: { ...parseJson(email.metadata), delivery_kind: 'admin_resend' } }));
  for (const email of customerEmailLog) entries.push(timelineEntry({
    id: `customer-email-${email.id}`, source: 'email', type: email.email_type, status: email.status || 'recorded',
    title: `${titleCase(email.email_type)} email`, detail: email.recipient_masked || '', occurredAt: email.sent_at || email.last_attempt_at || email.created_at,
    metadata: { ...parseJson(email.metadata), delivery_kind: 'automated', attempts: email.attempts, error_message: email.error_message || '', subject: email.subject || '' }
  }));

  return entries.filter((entry) => entry.occurredAt).sort((a, b) => dateValue(b.occurredAt) - dateValue(a.occurredAt));
}

async function loadCustomerDetail(tenantId) {
  const tenantRows = await selectRows('tenants', `select=id,name,account_name,plan_code,plan_status,account_status,tenant_role,trial_started_at,trial_ends_at,onboarding_completed_at,deletion_status,deletion_requested_at,deletion_scheduled_for,created_at,updated_at&id=${eq(tenantId)}&limit=1`);
  const tenant = tenantRows?.[0];
  if (!tenant?.id) return null;

  const [users, subscriptions, plans, billingEvents, syncEvents, snapshots, sessions, devices, otpChallenges, deletionRequests, auditRows, notes, emailLog, customerEmailLog] = await Promise.all([
    safeSelect('users', `select=id,tenant_id,email,phone_e164,display_name,role,status,email_verified,phone_verified,otp_test_last_verified_at,otp_test_status,last_login_at,account_recovery_last_verified_at,onboarding_status,onboarding_completed_at,welcome_email_sent_at,created_at,updated_at&tenant_id=${eq(tenantId)}&order=created_at.asc&limit=50`),
    safeSelect('tenant_subscriptions', `select=*&tenant_id=${eq(tenantId)}&order=updated_at.desc&limit=5`),
    safeSelect('subscription_plans', 'select=*&order=display_order.asc&limit=250'),
    safeSelect('billing_events', `select=id,tenant_id,subscription_id,provider,provider_event_id,event_type,status,amount_minor,currency,metadata,occurred_at,created_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=150`),
    safeSelect('vault_sync_events', `select=id,tenant_id,user_id,event_type,status,item_count,message,device_id,metadata,created_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=150`),
    safeSelect('vault_sync_snapshots', `select=id,tenant_id,user_id,item_count,client_updated_at,base_snapshot_id,device_id,device_type,created_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=50`),
    safeSelect('account_sessions', `select=id,tenant_id,user_id,device_id,status,issued_at,expires_at,renewed_at,last_seen_at,revoked_at,revoked_reason,created_at,updated_at&tenant_id=${eq(tenantId)}&order=issued_at.desc&limit=100`),
    safeSelect('account_devices', `select=id,tenant_id,user_id,client_device_id,device_name,device_type,platform,browser,first_verified_at,last_verified_at,last_seen_at,revoked_at,revoked_reason,created_at,updated_at&tenant_id=${eq(tenantId)}&order=last_seen_at.desc&limit=100`),
    safeSelect('otp_challenges', `select=id,tenant_id,user_id,purpose,delivery_channel,destination_masked,status,attempts,expires_at,verified_at,created_at,updated_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=100`),
    safeSelect('account_deletion_requests', `select=id,tenant_id,user_id,status,requested_at,scheduled_for,cancelled_at,completed_at,reason,contact_email_masked,metadata,created_at,updated_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=30`),
    safeSelect('audit_log', `select=id,tenant_id,user_id,action,metadata,created_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=1000`),
    safeSelect('admin_customer_notes', `select=id,tenant_id,note,created_by,created_at,updated_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=100`),
    safeSelect('admin_email_log', `select=id,tenant_id,user_id,email_type,recipient_masked,provider,provider_reference,status,error_message,metadata,created_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=100`),
    safeSelect('customer_email_log', `select=id,tenant_id,user_id,email_type,idempotency_key,recipient_masked,subject,provider,provider_reference,status,attempts,error_message,last_attempt_at,sent_at,metadata,created_at,updated_at&tenant_id=${eq(tenantId)}&order=created_at.desc&limit=200`)
  ]);

  const subscription = subscriptions?.[0] || null;
  const effectivePlanCode = subscription?.plan_code || tenant.plan_code || 'personal';
  const plan = plans.find((row) => String(row.code || '').toLowerCase() === String(effectivePlanCode).toLowerCase()) || null;
  const primaryUser = users.find((user) => ['administrator', 'owner'].includes(String(user.role || '').toLowerCase())) || users[0] || null;
  const deletion = deletionRequests?.[0] || (tenant.deletion_status && tenant.deletion_status !== 'none' ? {
    status: tenant.deletion_status, requested_at: tenant.deletion_requested_at, scheduled_for: tenant.deletion_scheduled_for
  } : null);
  const lastSuccessfulBackup = snapshots?.[0] || syncEvents.find((event) => String(event.status).toLowerCase() === 'success' && String(event.event_type || '').includes('backup')) || null;
  const latestSession = [...sessions].sort((a, b) => dateValue(b.issued_at || b.created_at) - dateValue(a.issued_at || a.created_at))[0] || null;
  const userLastLoginAt = users.map((user) => user.last_login_at).filter(Boolean).sort((a, b) => dateValue(b) - dateValue(a))[0] || null;
  const lastSignInAt = [userLastLoginAt, latestSession?.issued_at].filter(Boolean).sort((a, b) => dateValue(b) - dateValue(a))[0] || null;
  const verifiedDevices = devices.filter((device) => !device.revoked_at);
  const lastVerifiedDevice = [...verifiedDevices].sort((a, b) => dateValue(b.last_verified_at) - dateValue(a.last_verified_at))[0] || null;
  const activeSessions = sessions.filter((session) => String(session.status || '').toLowerCase() === 'active' && dateValue(session.expires_at) > Date.now());
  const emailOptions = adminEmailTypesForCustomer({ user: primaryUser, tenant, subscription, deletion });
  const fullTimeline = buildTimeline({ tenant, users, subscription, billingEvents, syncEvents, snapshots, sessions, otpChallenges, deletionRequests, auditRows, notes, emailLog, customerEmailLog });
  const timeline = fullTimeline.slice(0, 400);
  const trialSubscriptionHistory = fullTimeline.filter((entry) => ['trial', 'subscription', 'billing'].includes(entry.source)
    || /trial|subscription|stripe|payment|invoice|checkout|billing/i.test(String(entry.type || ''))).slice(0, 150);

  return {
    tenant,
    users,
    primaryUser,
    subscription,
    subscriptionHistory: subscriptions,
    trialSubscriptionHistory,
    plan,
    billingEvents,
    syncEvents,
    snapshots,
    sessions,
    devices,
    otpChallenges,
    deletion,
    deletionRequests,
    notes,
    emailLog,
    customerEmailLog,
    auditLog: auditRows,
    timeline,
    emailOptions,
    operationalSummary: {
      emailVerified: Boolean(primaryUser?.email_verified),
      phoneVerified: Boolean(primaryUser?.phone_verified),
      verificationStatus: primaryUser?.email_verified && (primaryUser?.phone_e164 ? primaryUser?.phone_verified : true) ? 'verified' : 'attention',
      lastVerificationAt: primaryUser?.otp_test_last_verified_at || lastVerifiedDevice?.last_verified_at || null,
      verifiedDeviceCount: verifiedDevices.length,
      activeSessionCount: activeSessions.length,
      lastSignInAt,
      lastSuccessfulBackupAt: lastSuccessfulBackup?.created_at || null,
      lastSuccessfulBackupItems: Number(lastSuccessfulBackup?.item_count || 0),
      latestSyncStatus: syncEvents?.[0]?.status || (lastSuccessfulBackup ? 'success' : 'not_started'),
      latestSyncMessage: syncEvents?.[0]?.message || '',
      deletionStatus: deletion?.status || tenant.deletion_status || 'none'
    },
    securityBoundary: {
      vaultContentsAccessible: false,
      masterPasswordAccessible: false,
      encryptedPayloadsReturned: false,
      message: 'Admin receives operational metadata only. Encrypted vault contents, encrypted document data and master passwords are never returned by this endpoint.'
    }
  };
}

export async function handler(event) {
  const session = readAdminSession(event);
  if (!session) return jsonResponse(401, { ok: false, version: APP_VERSION, code: 'ADMIN_SESSION_REQUIRED', message: 'Admin sign-in is required.' });

  const tenantId = safeText(event.queryStringParameters?.tenantId || parseBody(event).tenantId, 160);
  if (!tenantId) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'A customer account is required.' });

  if (event.httpMethod === 'GET') {
    try {
      const detail = await loadCustomerDetail(tenantId);
      if (!detail) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Customer account was not found.' });
      await audit(session, 'admin_customer_detail_viewed', { tenant_id: tenantId });
      return jsonResponse(200, { ok: true, version: APP_VERSION, customer: detail });
    } catch (error) {
      return jsonResponse(500, { ok: false, version: APP_VERSION, message: `Could not load customer details. ${error.message || ''}`.trim(), details: error.details || null });
    }
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
  const body = parseBody(event);
  const action = safeText(body.action, 80);

  try {
    const detail = await loadCustomerDetail(tenantId);
    if (!detail) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Customer account was not found.' });

    if (action === 'add_note') {
      const note = safeText(body.note, 4000);
      if (!note) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Enter an Admin note.' });
      const saved = await insertRow('admin_customer_notes', { id: publicId('adminnote'), tenant_id: tenantId, note, created_by: 'owner_admin' });
      await audit(session, 'admin_customer_note_added', { tenant_id: tenantId, note_id: saved.id, message: note.slice(0, 160) });
      return jsonResponse(200, { ok: true, version: APP_VERSION, note: saved, message: 'Admin note saved.' });
    }

    if (action === 'delete_note') {
      const noteId = safeText(body.noteId, 180);
      const rows = await safeSelect('admin_customer_notes', `select=id,tenant_id&tenant_id=${eq(tenantId)}&id=${eq(noteId)}&limit=1`);
      if (!rows?.[0]?.id) return jsonResponse(404, { ok: false, version: APP_VERSION, message: 'Admin note was not found.' });
      await deleteRow('admin_customer_notes', `id=${eq(noteId)}&tenant_id=${eq(tenantId)}`);
      await audit(session, 'admin_customer_note_deleted', { tenant_id: tenantId, note_id: noteId });
      return jsonResponse(200, { ok: true, version: APP_VERSION, message: 'Admin note deleted.' });
    }

    if (action === 'resend_account_email') {
      const emailType = safeText(body.emailType, 80);
      const owner = detail.primaryUser;
      if (!owner?.id || !owner.email) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'This account does not have an email recipient.' });
      const allowed = detail.emailOptions.some((option) => option.value === emailType);
      if (!allowed) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That email is not appropriate for the customer’s current account status.' });

      const emailLogId = publicId('adminemail');
      const recipientMasked = maskEmail(owner.email);
      await insertRow('admin_email_log', {
        id: emailLogId, tenant_id: tenantId, user_id: owner.id, email_type: emailType,
        recipient_masked: recipientMasked, provider: 'resend', provider_reference: null,
        status: 'pending', error_message: null, metadata: { version: APP_VERSION, requested_by: 'owner_admin' }
      });

      let delivery;
      try {
        if (emailType === 'verification') {
          const otp = await createAccountOtp({ tenantId, userId: owner.id, purpose: 'production_onboarding', channel: 'email', destination: owner.email, metadata: { requested_by_admin: true } });
          delivery = { sent: Boolean(otp.delivery?.sent), provider: otp.delivery?.provider || 'resend', providerId: otp.delivery?.providerId || '', challengeId: otp.challengeId };
          if (!delivery.sent) {
            const error = new Error(otp.delivery?.reason || 'The account verification email could not be sent.');
            error.status = 503;
            throw error;
          }
        } else {
          delivery = await sendAdminAccountEmail({
            to: owner.email,
            type: emailType,
            context: {
              displayName: owner.display_name,
              accountName: detail.tenant.account_name || detail.tenant.name,
              planName: detail.plan?.display_name || detail.subscription?.plan_code || detail.tenant.plan_code,
              accountStatus: detail.tenant.account_status,
              trialEndsAt: detail.tenant.trial_ends_at || detail.subscription?.trial_ends_at,
              deletionStatus: detail.deletion?.status || detail.tenant.deletion_status,
              deletionScheduledFor: detail.deletion?.scheduled_for || detail.tenant.deletion_scheduled_for
            }
          });
        }
        const log = await updateRow('admin_email_log', `id=${eq(emailLogId)}&tenant_id=${eq(tenantId)}`, {
          provider: delivery.provider || 'resend', provider_reference: delivery.providerId || null,
          status: 'sent', error_message: null,
          metadata: { version: APP_VERSION, requested_by: 'owner_admin', challenge_id: delivery.challengeId || null }
        });
        await audit(session, 'admin_account_email_sent', { tenant_id: tenantId, user_id: owner.id, email_type: emailType, email_log_id: emailLogId, recipient_masked: recipientMasked });
        return jsonResponse(200, { ok: true, version: APP_VERSION, email: log, message: emailType === 'verification' ? 'Account verification code resent.' : 'Account email sent.' });
      } catch (error) {
        await updateRow('admin_email_log', `id=${eq(emailLogId)}&tenant_id=${eq(tenantId)}`, {
          status: 'failed', error_message: safeText(error.message, 600),
          metadata: { version: APP_VERSION, requested_by: 'owner_admin' }
        }).catch(() => null);
        await audit(session, 'admin_account_email_failed', { tenant_id: tenantId, user_id: owner.id, email_type: emailType, email_log_id: emailLogId, error: safeText(error.message, 600) });
        throw error;
      }
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown customer-detail action.' });
  } catch (error) {
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, message: error.message || 'Customer operation failed.', details: error.details || null });
  }
}
