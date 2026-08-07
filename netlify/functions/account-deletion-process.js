import { APP_VERSION, deleteRow, selectRows, updateRow } from './_db.js';
import { stripeConfigured, stripeRequest } from './_stripe.js';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { loadCustomerEmailContext, sendCustomerLifecycleEmail } from './_customer-email.js';
import { finishScheduledCheck, recordOperationalEvent, startScheduledCheck } from './_operations.js';

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function lte(value) { return `lte.${encodeURIComponent(value)}`; }

function deletionEmailKey() {
  const secret = process.env.CUSTOMER_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!secret) return null;
  return createHash('sha256').update(`my-passwords-deletion-email:${secret}`).digest();
}

function sealDeletionEmail(email) {
  const key = deletionEmailKey();
  if (!key || !email) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(email), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
}

function openDeletionEmail(sealed) {
  try {
    const key = deletionEmailKey();
    if (!key || !sealed) return '';
    const [ivRaw, tagRaw, ciphertextRaw] = String(sealed).split('.');
    if (!ivRaw || !tagRaw || !ciphertextRaw) return '';
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivRaw, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextRaw, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

async function sendCompletionEmail(request, recipient, context = {}) {
  if (!request?.id || !recipient) return { sent: false, skipped: true, reason: 'recipient_unavailable' };
  return sendCustomerLifecycleEmail({
    to: recipient,
    type: 'account_deletion_completed',
    idempotencyKey: `account_deletion_completed:${request.id}`,
    context,
    metadata: { source: 'account_deletion_process', deletion_request_id: request.id }
  }).catch((error) => ({ sent: false, reason: error.message || 'Deletion completion email failed.' }));
}

async function retryPendingCompletionEmails() {
  const completed = await selectRows('account_deletion_requests', `select=*&status=${eq('completed')}&order=completed_at.desc&limit=25`).catch(() => []);
  const results = [];
  for (const request of completed || []) {
    const metadata = request?.metadata || {};
    if (metadata.completion_email_sent || !metadata.completion_email_recipient_sealed) continue;
    const recipient = openDeletionEmail(metadata.completion_email_recipient_sealed);
    if (!recipient) continue;
    const delivery = await sendCompletionEmail(request, recipient, {
      displayName: metadata.completion_email_display_name || 'there',
      accountName: metadata.completion_email_account_name || 'your Password-Encrypt account'
    });
    if (delivery.sent || delivery.reason === 'already_sent') {
      await updateRow('account_deletion_requests', `id=${eq(request.id)}`, {
        metadata: { ...metadata, completion_email_sent: true, completion_email_sent_at: new Date().toISOString(), completion_email_recipient_sealed: null, version: APP_VERSION },
        updated_at: new Date().toISOString()
      }).catch(() => null);
    }
    results.push({ requestId: request.id, sent: Boolean(delivery.sent), reason: delivery.reason || '' });
  }
  return results;
}

export async function handler() {
  const now = new Date().toISOString();
  const checkRun = await startScheduledCheck('account_deletion_processing', 'scheduled');
  const due = await selectRows('account_deletion_requests', `select=*&status=${eq('pending')}&scheduled_for=${lte(now)}&order=scheduled_for.asc&limit=5`).catch(() => []);
  const results = [];

  for (const request of due || []) {
    if (!request?.id || !request?.tenant_id) continue;
    let stripeCancellation = { attempted: false, completed: false, error: '' };
    try {
      const claimed = await updateRow('account_deletion_requests', `id=${eq(request.id)}&status=${eq('pending')}`, { status: 'processing', updated_at: now });
      if (!claimed?.id) {
        results.push({ requestId: request.id, status: 'skipped', reason: 'Request was already claimed.' });
        continue;
      }
      const customerContext = await loadCustomerEmailContext(request.tenant_id).catch(() => ({ tenant: null, user: null }));
      const completionRecipient = String(customerContext?.user?.email || '').trim();
      const completionEmailMetadata = completionRecipient ? {
        ...(request.metadata || {}),
        completion_email_recipient_sealed: sealDeletionEmail(completionRecipient),
        completion_email_account_name: customerContext?.tenant?.account_name || customerContext?.tenant?.name || 'Password-Encrypt',
        completion_email_display_name: customerContext?.user?.display_name || 'there',
        completion_email_sent: false,
        version: APP_VERSION
      } : { ...(request.metadata || {}), version: APP_VERSION };
      await updateRow('account_deletion_requests', `id=${eq(request.id)}`, { metadata: completionEmailMetadata, updated_at: new Date().toISOString() }).catch(() => null);

      const subscriptions = await selectRows('tenant_subscriptions', `select=id,provider,provider_subscription_id,status&tenant_id=${eq(request.tenant_id)}&limit=1`).catch(() => []);
      const subscription = subscriptions?.[0];
      const subscriptionStatus = String(subscription?.status || '').toLowerCase();
      const stripeAlreadyEnded = ['canceled', 'cancelled', 'ended', 'inactive', 'expired'].includes(subscriptionStatus);
      if (subscription?.provider === 'stripe' && subscription.provider_subscription_id && !stripeAlreadyEnded) {
        stripeCancellation.attempted = true;
        if (!stripeConfigured()) throw new Error('Stripe must be configured before this paid account can be deleted safely.');
        try {
          await stripeRequest(`subscriptions/${encodeURIComponent(subscription.provider_subscription_id)}`, { method: 'DELETE', idempotencyKey: `mp-delete-${request.id}` });
          stripeCancellation.completed = true;
        } catch (error) {
          stripeCancellation.error = String(error.message || 'Stripe cancellation failed.').slice(0, 500);
          throw new Error(`Stripe subscription cancellation must complete before account deletion: ${stripeCancellation.error}`);
        }
      }

      await deleteRow('tenants', `id=${eq(request.tenant_id)}`);
      const completedAt = new Date().toISOString();
      const completedRequest = await updateRow('account_deletion_requests', `id=${eq(request.id)}`, {
        status: 'completed',
        completed_at: completedAt,
        updated_at: completedAt,
        metadata: { ...completionEmailMetadata, version: APP_VERSION, stripe_cancellation: stripeCancellation }
      });
      const completionDelivery = completionRecipient ? await sendCompletionEmail(completedRequest || request, completionRecipient, {
        displayName: completionEmailMetadata.completion_email_display_name,
        accountName: completionEmailMetadata.completion_email_account_name
      }) : { sent: false, skipped: true, reason: 'recipient_unavailable' };
      if (completionDelivery.sent || completionDelivery.reason === 'already_sent') {
        await updateRow('account_deletion_requests', `id=${eq(request.id)}`, {
          metadata: { ...completionEmailMetadata, version: APP_VERSION, stripe_cancellation: stripeCancellation, completion_email_sent: true, completion_email_sent_at: new Date().toISOString(), completion_email_recipient_sealed: null },
          updated_at: new Date().toISOString()
        }).catch(() => null);
      }
      results.push({ requestId: request.id, status: 'completed', completionEmailSent: Boolean(completionDelivery.sent) });
    } catch (error) {
      await updateRow('account_deletion_requests', `id=${eq(request.id)}`, {
        status: 'pending',
        updated_at: new Date().toISOString(),
        metadata: { ...(request.metadata || {}), version: APP_VERSION, last_processing_error: String(error.message || error).slice(0, 800), stripe_cancellation: stripeCancellation }
      }).catch(() => null);
      results.push({ requestId: request.id, status: 'failed', error: String(error.message || error) });
      await recordOperationalEvent({
        source: 'account-deletion-process', eventType: 'account_deletion_processing_failure', severity: 'error',
        errorCode: error?.code || error?.name || 'ACCOUNT_DELETION_PROCESSING_FAILED',
        message: 'A scheduled account deletion could not complete safely and remains pending.',
        tenantId: request.tenant_id, metadata: { requestId: request.id, stripeCancellationAttempted: stripeCancellation.attempted }
      });
    }
  }

  const completionEmailRetries = await retryPendingCompletionEmails();
  const processingFailures = results.filter((row) => row.status === 'failed').length;
  const retryFailures = completionEmailRetries.filter((row) => !row.sent && row.reason && row.reason !== 'already_sent').length;
  const issuesFound = processingFailures + retryFailures;
  await finishScheduledCheck(checkRun, {
    status: issuesFound ? 'warning' : 'success', itemsChecked: (due || []).length + completionEmailRetries.length, issuesFound,
    summary: { due: (due || []).length, completed: results.filter((row) => row.status === 'completed').length, processingFailures, completionEmailRetryFailures: retryFailures }
  });
  console.log(JSON.stringify({ version: APP_VERSION, checkedAt: now, processed: results.length, results, completionEmailRetries }));
  return { statusCode: 200, body: JSON.stringify({ ok: true, version: APP_VERSION, processed: results.length, results, completionEmailRetries }) };
}
