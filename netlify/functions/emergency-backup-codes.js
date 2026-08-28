import { createHash } from 'node:crypto';
import { APP_VERSION, deleteRow, insertRow, jsonResponse, parseBody, publicId, selectRows, updateRow } from './_db.js';
import { validateCustomerSession } from './_account-session.js';
import { assertBrowserAction, consumeRateLimit, requestIpHash } from './_security.js';
import { recordOperationalEvent } from './_operations.js';

const CODE_COUNT = 10;
const REMINDER_DAYS = 90;

function eq(value) { return `eq.${encodeURIComponent(value)}`; }
function neq(value) { return `neq.${encodeURIComponent(value)}`; }
function safeText(value, max = 1200) { return String(value || '').trim().slice(0, max); }
function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function siteUrl() {
  const raw = String(process.env.URL || 'https://password-encrypt.com').replace(/\/$/, '');
  return /^https?:\/\//i.test(raw) ? raw : 'https://password-encrypt.com';
}
function formatDate(value) {
  const date = new Date(value || '');
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
function codePattern(value) { return /^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){5}$/.test(String(value || '').trim().toUpperCase()); }
function codeHash(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
  return createHash('sha256').update(`Password-Encrypt emergency backup code v1:${compact}`).digest('hex');
}
function envelopeValid(entry = {}) {
  return /^[a-f0-9]{64}$/i.test(String(entry.codeHash || ''))
    && safeText(entry.wrapSalt, 400).length >= 16
    && safeText(entry.wrapIv, 200).length >= 12
    && safeText(entry.wrappedMasterPassword, 10000).length >= 24;
}
async function currentUser(session) {
  const rows = await selectRows('users', `select=id,tenant_id,email,email_verified,display_name&tenant_id=${eq(session.tenantId)}&id=${eq(session.userId)}&limit=1`);
  return rows?.[0] || null;
}
async function activeRows(session) {
  return selectRows('emergency_backup_codes', `select=id,tenant_id,user_id,batch_id,code_hash,wrap_salt,wrap_iv,wrapped_master_password,status,created_at,used_at,reminders_enabled,last_reminder_at,emailed_at&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&status=${eq('active')}&order=created_at.desc&limit=20`);
}
function statusFromRows(rows = []) {
  const active = Array.isArray(rows) ? rows : [];
  const first = active[0] || null;
  return {
    configured: active.length > 0,
    activeCount: active.length,
    batchId: first?.batch_id || '',
    generatedAt: first?.created_at || '',
    remindersEnabled: first ? first.reminders_enabled !== false : true,
    lastReminderAt: first?.last_reminder_at || '',
    emailedAt: first?.emailed_at || '',
    reminderDays: REMINDER_DAYS
  };
}

async function sendEmail({ to, subject, heading, paragraphs = [], codeLines = [] }) {
  const apiKey = process.env.RESEND_API_KEY || '';
  const from = process.env.OTP_EMAIL_FROM || '';
  if (!apiKey || !from || !to || !to.includes('@')) return { sent: false, reason: 'Email delivery is not configured.' };
  const safeParagraphs = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.6;color:#536579">${p}</p>`).join('');
  const codesHtml = codeLines.length ? `<div style="margin:18px 0;padding:16px;background:#f4f7fa;border:1px solid #d7e2ec;border-radius:16px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.9;color:#14263b">${codeLines.map((code) => `<div>${escapeHtml(code)}</div>`).join('')}</div>` : '';
  const text = [...paragraphs.map((p) => String(p).replace(/<[^>]+>/g, '')), ...(codeLines.length ? ['', ...codeLines] : []), '', 'Password-Encrypt · A ZippyWeb project', 'Support: info@zippyweb.uk'].join('\n\n');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        from, to, subject,
        html: `<!doctype html><html><body style="margin:0;padding:0;background:#edf3f8;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border:1px solid #d7e2ec;border-radius:22px;padding:28px"><h1 style="margin:0 0 16px;color:#14263b;font-size:25px">${escapeHtml(heading)}</h1>${safeParagraphs}${codesHtml}<p style="margin-top:24px;font-size:13px;line-height:1.5;color:#7b8fa3">Password-Encrypt · A ZippyWeb project<br>Support: info@zippyweb.uk</p></div></div></body></html>`,
        text
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { sent: false, reason: data?.message || `Email provider returned HTTP ${response.status}.` };
    return { sent: true, providerId: data?.id || '' };
  } catch (error) {
    return { sent: false, reason: error.name === 'AbortError' ? 'Email delivery timed out.' : (error.message || 'Email delivery failed.') };
  } finally { clearTimeout(timeout); }
}

export async function sendEmergencyBackupReminder({ tenantId, userId, activeCount, generatedAt }) {
  const users = await selectRows('users', `select=id,tenant_id,email,email_verified,display_name&tenant_id=${eq(tenantId)}&id=${eq(userId)}&limit=1`);
  const user = users?.[0];
  if (!user?.email || user.email_verified === false) return { sent: false, reason: 'No verified email is available.' };
  return sendEmail({
    to: user.email,
    subject: 'Password-Encrypt Emergency Backup Codes reminder',
    heading: 'Check your Emergency Backup Codes',
    paragraphs: [
      `Hello ${escapeHtml(user.display_name || 'there')},`,
      `You currently have <strong>${Number(activeCount || 0)} unused Emergency Backup Code${Number(activeCount || 0) === 1 ? '' : 's'}</strong>${generatedAt ? ` from ${escapeHtml(formatDate(generatedAt))}` : ''}.`,
      'Please make sure you still have your codes stored somewhere private and separate from the device that holds your vault.',
      '<strong>This reminder never contains your backup codes.</strong> Password-Encrypt does not keep a readable copy that can simply be re-sent. If you have lost the codes, open your unlocked vault and generate a fresh set in Settings.',
      `Open Password-Encrypt: ${escapeHtml(siteUrl())}/vault`
    ]
  });
}

export async function handler(event) {
  const validation = await validateCustomerSession(event, { touch: true });
  if (!validation.ok) return jsonResponse(401, { ok: false, version: APP_VERSION, code: validation.code || 'SESSION_REQUIRED', message: validation.message || 'Verify this device to manage Emergency Backup Codes.' });
  const session = validation.session;

  try {
    if (event.httpMethod === 'GET') {
      const rows = await activeRows(session);
      const status = statusFromRows(rows);
      const includeEnvelopes = String(event.queryStringParameters?.include || '') === '1';
      if (includeEnvelopes) {
        const user = await currentUser(session);
        if (!user?.email || user.email_verified !== true) {
          return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your account email before using an Emergency Backup Code.' });
        }
      }
      return jsonResponse(200, {
        ok: true, version: APP_VERSION, ...status,
        codes: includeEnvelopes ? rows.map((row) => ({
          id: row.id, batchId: row.batch_id, codeHash: row.code_hash, wrapSalt: row.wrap_salt,
          wrapIv: row.wrap_iv, wrappedMasterPassword: row.wrapped_master_password, createdAt: row.created_at
        })) : undefined
      });
    }

    if (event.httpMethod !== 'POST') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET or POST required.' });
    try { assertBrowserAction(event, { session, kind: 'customer', csrf: true }); }
    catch (error) { return jsonResponse(error.status || 403, { ok: false, version: APP_VERSION, code: error.code, message: error.message }); }

    const body = parseBody(event);
    const action = safeText(body.action, 40);

    if (action === 'replace') {
      const user = await currentUser(session);
      if (!user?.email || user.email_verified !== true) return jsonResponse(409, { ok: false, version: APP_VERSION, code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Verify your account email before generating Emergency Backup Codes so the recovery path can be verified later.' });
      const codes = Array.isArray(body.codes) ? body.codes : [];
      if (codes.length !== CODE_COUNT || !codes.every(envelopeValid)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: `Generate exactly ${CODE_COUNT} valid Emergency Backup Codes.` });
      if (new Set(codes.map((entry) => String(entry.codeHash).toLowerCase())).size !== CODE_COUNT) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Emergency Backup Codes must be unique.' });
      await consumeRateLimit(event, { scope: 'backup_codes_replace', identifier: `${session.tenantId}:${session.userId}:${requestIpHash(event)}`, limit: 6, windowSeconds: 60 * 60, blockSeconds: 60 * 60 });
      const now = new Date().toISOString();
      const batchId = publicId('backup_batch');
      try {
        for (const entry of codes) {
          await insertRow('emergency_backup_codes', {
            id: publicId('backup_code'), tenant_id: session.tenantId, user_id: session.userId, batch_id: batchId,
            code_hash: String(entry.codeHash).toLowerCase(), wrap_salt: safeText(entry.wrapSalt, 400), wrap_iv: safeText(entry.wrapIv, 200),
            wrapped_master_password: safeText(entry.wrappedMasterPassword, 10000), status: 'active', reminders_enabled: body.remindersEnabled !== false,
            created_at: now, updated_at: now
          });
        }
      } catch (error) {
        await deleteRow('emergency_backup_codes', `tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&batch_id=${eq(batchId)}`).catch(() => null);
        throw error;
      }
      // Remove older recovery envelopes rather than merely flagging them revoked. This makes old codes cryptographically useless against current server data.
      await deleteRow('emergency_backup_codes', `tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&batch_id=${neq(batchId)}`).catch(() => null);
      await insertRow('audit_log', { id: publicId('audit'), tenant_id: session.tenantId, user_id: session.userId, action: 'emergency_backup_codes_generated', metadata: { version: APP_VERSION, batch_id: batchId, count: CODE_COUNT } }).catch(() => null);
      return jsonResponse(200, { ok: true, version: APP_VERSION, activeCount: CODE_COUNT, batchId, generatedAt: now, remindersEnabled: body.remindersEnabled !== false, reminderDays: REMINDER_DAYS, message: `${CODE_COUNT} new Emergency Backup Codes are ready. Older codes have been revoked.` });
    }

    if (action === 'revoke_all') {
      const rows = await activeRows(session);
      if (rows.length) await deleteRow('emergency_backup_codes', `tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&status=${eq('active')}`);
      await insertRow('audit_log', { id: publicId('audit'), tenant_id: session.tenantId, user_id: session.userId, action: 'emergency_backup_codes_revoked', metadata: { version: APP_VERSION, count: rows.length, reason: safeText(body.reason, 80) || 'customer_action' } }).catch(() => null);
      return jsonResponse(200, { ok: true, version: APP_VERSION, activeCount: 0, configured: false, message: rows.length ? 'Previous Emergency Backup Codes were invalidated.' : 'There were no active Emergency Backup Codes to invalidate.' });
    }

    if (action === 'set_reminders') {
      const enabled = body.enabled !== false;
      const rows = await activeRows(session);
      if (!rows.length) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'Generate Emergency Backup Codes before changing reminder settings.' });
      await updateRow('emergency_backup_codes', `tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&status=${eq('active')}`, { reminders_enabled: enabled, updated_at: new Date().toISOString() });
      return jsonResponse(200, { ok: true, version: APP_VERSION, remindersEnabled: enabled, message: enabled ? 'Backup-code email reminders are on.' : 'Backup-code email reminders are off.' });
    }

    if (action === 'email_codes') {
      const codes = Array.isArray(body.codes) ? body.codes.map((code) => String(code || '').trim().toUpperCase()) : [];
      if (codes.length !== CODE_COUNT || !codes.every(codePattern)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Only the newly generated set of 10 Emergency Backup Codes can be emailed.' });
      await consumeRateLimit(event, { scope: 'backup_codes_email', identifier: `${session.tenantId}:${session.userId}:${requestIpHash(event)}`, limit: 4, windowSeconds: 60 * 60, blockSeconds: 60 * 60 });
      const active = await activeRows(session);
      const activeHashes = new Set((active || []).map((row) => String(row.code_hash || '').toLowerCase()));
      const requestedHashes = codes.map(codeHash);
      if (activeHashes.size !== CODE_COUNT || requestedHashes.some((hash) => !activeHashes.has(hash))) {
        return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'For security, only the currently active set can be emailed immediately after generation. Generate a new set if you no longer have the codes.' });
      }
      const user = await currentUser(session);
      if (!user?.email || user.email_verified === false) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'A verified email address is required before backup codes can be emailed.' });
      const delivery = await sendEmail({
        to: user.email,
        subject: 'Password-Encrypt Emergency Backup Codes — Keep this email secure',
        heading: 'Your Emergency Backup Codes',
        paragraphs: [
          `Hello ${escapeHtml(user.display_name || 'there')},`,
          '<strong>You asked Password-Encrypt to email this newly generated set.</strong> Anyone who can read these codes and verify your account email may be able to recover access to your encrypted vault.',
          'Store this email somewhere private. Do not forward it, do not send the codes to support, and delete copies from an unsafe mailbox or shared device.',
          'Each code can be used once. Generating a new set revokes all older unused codes.'
        ],
        codeLines: codes
      });
      if (!delivery.sent) return jsonResponse(502, { ok: false, version: APP_VERSION, message: delivery.reason || 'Backup codes could not be emailed.' });
      const now = new Date().toISOString();
      await updateRow('emergency_backup_codes', `tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&status=${eq('active')}`, { emailed_at: now, updated_at: now }).catch(() => null);
      await insertRow('audit_log', { id: publicId('audit'), tenant_id: session.tenantId, user_id: session.userId, action: 'emergency_backup_codes_emailed', metadata: { version: APP_VERSION, count: CODE_COUNT, provider_id: delivery.providerId || '' } }).catch(() => null);
      return jsonResponse(200, { ok: true, version: APP_VERSION, emailedAt: now, message: `The new Emergency Backup Codes were emailed to ${user.email}.` });
    }

    if (action === 'send_reminder') {
      const rows = await activeRows(session);
      if (!rows.length) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'There are no unused Emergency Backup Codes to remind you about.' });
      const status = statusFromRows(rows);
      const delivery = await sendEmergencyBackupReminder({ tenantId: session.tenantId, userId: session.userId, activeCount: status.activeCount, generatedAt: status.generatedAt });
      if (!delivery.sent) return jsonResponse(502, { ok: false, version: APP_VERSION, message: delivery.reason || 'The reminder email could not be sent.' });
      const now = new Date().toISOString();
      await updateRow('emergency_backup_codes', `tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&status=${eq('active')}`, { last_reminder_at: now, updated_at: now });
      return jsonResponse(200, { ok: true, version: APP_VERSION, lastReminderAt: now, message: 'Backup-code reminder email sent.' });
    }

    if (action === 'consume') {
      const codeHash = safeText(body.codeHash, 64).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(codeHash)) return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Emergency Backup Code is invalid.' });
      await consumeRateLimit(event, { scope: 'backup_code_consume', identifier: `${session.tenantId}:${session.userId}:${requestIpHash(event)}`, limit: 12, windowSeconds: 15 * 60, blockSeconds: 30 * 60 });
      const rows = await selectRows('emergency_backup_codes', `select=id,batch_id,status&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&code_hash=${eq(codeHash)}&status=${eq('active')}&limit=1`);
      const row = rows?.[0];
      if (!row?.id) return jsonResponse(409, { ok: false, version: APP_VERSION, message: 'That Emergency Backup Code is no longer available.' });
      const now = new Date().toISOString();
      // Delete the used encrypted recovery envelope so the one-time code cannot be reused against retained server data.
      await deleteRow('emergency_backup_codes', `id=${eq(row.id)}&tenant_id=${eq(session.tenantId)}&user_id=${eq(session.userId)}&status=${eq('active')}`);
      const remaining = await activeRows(session);
      const user = await currentUser(session).catch(() => null);
      if (user?.email && user.email_verified !== false) {
        sendEmail({
          to: user.email,
          subject: 'Security notice: Emergency Backup Code used',
          heading: 'An Emergency Backup Code was used',
          paragraphs: [
            `Hello ${escapeHtml(user.display_name || 'there')},`,
            'One of your Password-Encrypt Emergency Backup Codes was used to recover vault access after account verification.',
            `The recovered code was removed immediately. The other ${remaining.length} code${remaining.length === 1 ? '' : 's'} in that old set will be replaced when you finish setting a new master password.`,
            'If this was not you, end other sessions from Settings → My Account and contact Password-Encrypt support immediately. The email does not contain the code that was used.'
          ]
        }).catch(() => null);
      }
      await insertRow('audit_log', { id: publicId('audit'), tenant_id: session.tenantId, user_id: session.userId, action: 'emergency_backup_code_used', metadata: { version: APP_VERSION, remaining: remaining.length } }).catch(() => null);
      return jsonResponse(200, { ok: true, version: APP_VERSION, remainingCount: remaining.length, usedAt: now, message: `Emergency Backup Code used. ${remaining.length} unused code${remaining.length === 1 ? '' : 's'} remain.` });
    }

    return jsonResponse(400, { ok: false, version: APP_VERSION, message: 'Unknown Emergency Backup Code action.' });
  } catch (error) {
    if (error?.status === 404 || /relation .*emergency_backup_codes.* does not exist/i.test(String(error?.message || ''))) {
      return jsonResponse(503, { ok: false, version: APP_VERSION, code: 'BACKUP_CODES_TABLE_REQUIRED', message: 'Emergency Backup Code storage has not been installed yet.' });
    }
    await recordOperationalEvent({ source: 'emergency_backup_codes', eventType: 'emergency_backup_codes_failure', severity: 'warning', errorCode: error?.code || 'BACKUP_CODES_FAILED', message: 'An Emergency Backup Code action failed.', tenantId: session.tenantId, userId: session.userId }).catch(() => null);
    return jsonResponse(error.status || 500, { ok: false, version: APP_VERSION, code: error.code || 'BACKUP_CODES_FAILED', message: error.message || 'Emergency Backup Code action failed.' });
  }
}
