import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Ban, CalendarClock, Check, Cloud, CreditCard, FileText, Mail, RefreshCw, Save, ShieldCheck, Trash2, UserRoundCheck } from 'lucide-react';
import CustomSelect from './CustomSelect.jsx';

async function requestJson(url, options = {}) {
  try {
    const method = String(options.method || 'GET').toUpperCase();
    const csrfToken = sessionStorage.getItem('mp_admin_csrf') || '';
    const headers = { ...(options.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD') {
      headers['x-mp-request'] = '1';
      if (csrfToken) headers['x-mp-csrf'] = csrfToken;
    }
    const response = await fetch(url, { credentials: 'same-origin', ...options, headers });
    const data = await response.json().catch(() => ({ ok: false, message: 'The server returned an invalid response.' }));
    if (data?.csrfToken) sessionStorage.setItem('mp_admin_csrf', data.csrfToken);
    if (response.status === 401) sessionStorage.removeItem('mp_admin_csrf');
    if (!response.ok) return { ...data, ok: false, httpStatus: response.status };
    return data;
  } catch {
    return { ok: false, message: 'The Admin service could not be reached. Please try again.' };
  }
}

function dateLabel(value, includeTime = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', includeTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function money(value, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: String(currency || 'GBP').toUpperCase() }).format(Number(value || 0) / 100);
}

function label(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}


function metadataObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function auditSummary(entry) {
  const metadata = metadataObject(entry?.metadata);
  const parts = [];
  if (metadata.account_status) parts.push(`Status: ${label(metadata.account_status)}`);
  if (metadata.days) parts.push(`${metadata.days} day${Number(metadata.days) === 1 ? '' : 's'}`);
  if (metadata.plan_code) parts.push(`Plan: ${label(metadata.plan_code)}`);
  if (metadata.email_type) parts.push(`Email: ${label(metadata.email_type)}`);
  if (metadata.stripe_sync_status) parts.push(`Stripe: ${label(metadata.stripe_sync_status)}`);
  if (metadata.message) parts.push(String(metadata.message));
  if (metadata.error) parts.push(`Error: ${String(metadata.error)}`);
  return parts.join(' · ') || (metadata.actor === 'owner_admin' ? 'Owner Admin action' : 'Account event');
}

function statusTone(value) {
  const status = String(value || '').toLowerCase();
  if (['success', 'active', 'verified', 'sent', 'approved', 'trialing'].includes(status)) return 'success';
  if (['warning', 'attention', 'pending', 'past_due', 'incomplete', 'trial_pending'].includes(status)) return 'warning';
  if (['error', 'failed', 'unpaid', 'suspended', 'cancelled', 'revoked'].includes(status)) return 'error';
  return 'recorded';
}

export default function AdminCustomerDetail({ customerId, onBack, onChanged, onSessionExpired, setGlobalNotice }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState('');
  const [trialDays, setTrialDays] = useState('7');
  const [emailType, setEmailType] = useState('');

  useEffect(() => { loadDetail(); }, [customerId]);

  async function loadDetail() {
    setLoading(true);
    const result = await requestJson(`/.netlify/functions/admin-customer-detail?tenantId=${encodeURIComponent(customerId)}`);
    setLoading(false);
    if (!result.ok) {
      if (result.httpStatus === 401 && onSessionExpired) onSessionExpired(result.message);
      setNotice(result.message || 'Customer details could not be loaded.');
      return;
    }
    setDetail(result.customer || null);
    const firstOption = result.customer?.emailOptions?.[0]?.value || '';
    setEmailType((current) => result.customer?.emailOptions?.some((option) => option.value === current) ? current : firstOption);
    setNotice('');
  }

  async function runCustomerAction(action, payload = {}, successFallback = 'Customer account updated.') {
    setBusy(true);
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, tenantId: customerId, ...payload })
    });
    setBusy(false);
    if (result.httpStatus === 401 && onSessionExpired) {
      onSessionExpired(result.message || 'Admin sign-in is required.');
      return;
    }
    setNotice(result.message || (result.ok ? successFallback : 'Customer operation failed.'));
    if (setGlobalNotice) setGlobalNotice(result.message || '');
    if (result.ok) {
      await loadDetail();
      if (onChanged) await onChanged();
    }
  }

  async function runDetailAction(action, payload = {}, successFallback = 'Customer details updated.') {
    setBusy(true);
    const result = await requestJson('/.netlify/functions/admin-customer-detail', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, tenantId: customerId, ...payload })
    });
    setBusy(false);
    if (result.httpStatus === 401 && onSessionExpired) {
      onSessionExpired(result.message || 'Admin sign-in is required.');
      return;
    }
    setNotice(result.message || (result.ok ? successFallback : 'Customer operation failed.'));
    if (setGlobalNotice) setGlobalNotice(result.message || '');
    if (result.ok) {
      setNote('');
      await loadDetail();
      if (onChanged) await onChanged();
    }
  }

  async function addNote(event) {
    event.preventDefault();
    if (!note.trim()) return;
    await runDetailAction('add_note', { note: note.trim() }, 'Admin note saved.');
  }

  async function deleteNote(noteId) {
    if (!window.confirm('Delete this Admin note?')) return;
    await runDetailAction('delete_note', { noteId }, 'Admin note deleted.');
  }

  async function sendEmail() {
    if (!emailType) return;
    await runDetailAction('resend_account_email', { emailType }, 'Account email sent.');
  }

  const timeline = useMemo(() => detail?.timeline || [], [detail]);
  const tenant = detail?.tenant || {};
  const owner = detail?.primaryUser || {};
  const summary = detail?.operationalSummary || {};
  const subscription = detail?.subscription || null;
  const stripeManaged = subscription?.provider === 'stripe' && Boolean(subscription?.provider_subscription_id);
  const trialStatus = String(subscription?.status || tenant.plan_status || '').toLowerCase();
  const hasTrialHistory = Boolean(tenant.trial_started_at || tenant.trial_ends_at || subscription?.trial_started_at || subscription?.trial_ends_at || trialStatus.includes('trial'));
  const trialExtendable = stripeManaged ? ['trialing', 'trial_active'].includes(trialStatus) : hasTrialHistory;
  const founder = ['founder_private', 'private_founder'].includes(String(tenant.plan_code || '').toLowerCase()) || String(tenant.plan_status || '').toLowerCase() === 'founder_active';

  if (loading) {
    return <section className="admin-content"><div className="admin-panel admin-detail-loading"><RefreshCw className="spin-icon" /><strong>Loading customer details</strong></div></section>;
  }

  if (!detail) {
    return <section className="admin-content"><div className="admin-panel"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={17} /> Back to customers</button><div className="admin-notice error">{notice || 'Customer details are unavailable.'}</div></div></section>;
  }

  return (
    <section className="admin-content admin-customer-detail-page">
      <section className="admin-detail-header admin-panel">
        <div className="admin-detail-heading">
          <button type="button" className="admin-detail-back" onClick={onBack}><ArrowLeft size={19} /> Customers</button>
          <div>
            <p className="eyebrow">Customer detail</p>
            <h2>{tenant.account_name || tenant.name || 'Customer account'}</h2>
            <span>{owner.display_name || 'Account owner'} · {owner.email || 'No email'} · {customerId}</span>
          </div>
        </div>
        <div className="admin-detail-statuses">
          <button type="button" className="secondary-button admin-detail-refresh" onClick={loadDetail} disabled={loading || busy}><RefreshCw size={16} className={loading ? 'spin-icon' : ''} /> Refresh customer</button>
          <span className={`admin-status ${statusTone(tenant.account_status)}`}>{label(tenant.account_status || 'active')}</span>
          <span className={`admin-status ${statusTone(subscription?.status || tenant.plan_status)}`}>{label(subscription?.status || tenant.plan_status)}</span>
          <span className={`admin-status ${statusTone(summary.verificationStatus)}`}>{summary.verificationStatus === 'verified' ? 'Contacts verified' : 'Verification attention'}</span>
        </div>
      </section>

      {notice && <div className={`admin-notice ${notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('could not') ? 'error' : ''}`}>{notice}</div>}

      <section className="admin-security-boundary">
        <ShieldCheck size={22} />
        <div><strong>Operational access only</strong><span>{detail.securityBoundary?.message}</span></div>
      </section>

      <div className="admin-detail-metrics">
        <article><UserRoundCheck /><small>Last successful sign-in</small><strong>{dateLabel(summary.lastSignInAt)}</strong><span>{summary.activeSessionCount || 0} active session(s)</span></article>
        <article><Cloud /><small>Last successful backup</small><strong>{dateLabel(summary.lastSuccessfulBackupAt)}</strong><span>{summary.lastSuccessfulBackupItems || 0} encrypted item(s)</span></article>
        <article><Check /><small>Verification</small><strong>{summary.emailVerified ? 'Email verified' : 'Email not verified'}</strong><span>{owner.phone_e164 ? (summary.phoneVerified ? 'Mobile verified' : 'Mobile not verified') : 'No mobile added'}</span></article>
        <article><Trash2 /><small>Deletion status</small><strong>{label(summary.deletionStatus || 'none')}</strong><span>{detail.deletion?.scheduled_for ? `Scheduled ${dateLabel(detail.deletion.scheduled_for, false)}` : 'No scheduled deletion date'}</span></article>
      </div>

      <div className="admin-detail-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Account</p><h2>Profile and verification</h2></div><span>{detail.users?.length || 0} user(s)</span></div>
          <div className="admin-detail-data-grid">
            <span><small>Plan</small><strong>{detail.plan?.display_name || label(tenant.plan_code)}</strong></span>
            <span><small>Account created</small><strong>{dateLabel(tenant.created_at)}</strong></span>
            <span><small>Email</small><strong>{owner.email || '—'}</strong><em>{owner.email_verified ? 'Verified' : 'Not verified'}</em></span>
            <span><small>Mobile</small><strong>{owner.phone_e164 || '—'}</strong><em>{owner.phone_e164 ? (owner.phone_verified ? 'Verified' : 'Not verified') : 'Not added'}</em></span>
            <span><small>Last verification</small><strong>{dateLabel(summary.lastVerificationAt)}</strong></span>
            <span><small>Verified devices</small><strong>{summary.verifiedDeviceCount || 0}</strong></span>
            <span><small>Onboarding</small><strong>{label(owner.onboarding_status || (tenant.onboarding_completed_at ? 'complete' : 'pending'))}</strong></span>
            <span><small>Recovery last used</small><strong>{dateLabel(owner.account_recovery_last_verified_at)}</strong></span>
            <span><small>Billing interval</small><strong>{subscription?.billing_interval ? label(subscription.billing_interval) : '—'}</strong></span>
            <span><small>Current price</small><strong>{subscription && subscription.price_minor !== null && subscription.price_minor !== undefined ? money(subscription.price_minor, subscription.currency) : '—'}</strong></span>
            <span><small>Current period ends</small><strong>{dateLabel(subscription?.current_period_end)}</strong></span>
            <span><small>Next invoice</small><strong>{subscription && subscription.next_invoice_amount_minor !== null && subscription.next_invoice_amount_minor !== undefined ? `${money(subscription.next_invoice_amount_minor, subscription.next_invoice_currency || subscription.currency)} · ${dateLabel(subscription.next_invoice_at, false)}` : '—'}</strong></span>
            <span><small>Last Stripe refresh</small><strong>{dateLabel(subscription?.last_stripe_sync_at)}</strong></span>
            <span><small>Payment status</small><strong>{label(subscription?.status || tenant.plan_status || 'not started')}</strong></span>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Controls</p><h2>Account operations</h2></div><span>Audited</span></div>
          <div className="admin-operation-stack">
            {!founder && <div className="admin-operation-row"><div><strong>{tenant.account_status === 'suspended' ? 'Reactivate account' : 'Suspend account'}</strong><span>Controls access to account services. It does not read or alter the encrypted vault.</span></div>{tenant.account_status === 'suspended' ? <button type="button" className="secondary-button" disabled={busy} onClick={() => runCustomerAction('set_account_status', { accountStatus: 'active' }, 'Account reactivated.')}><UserRoundCheck size={16} /> Reactivate</button> : <button type="button" className="secondary-button danger-soft" disabled={busy} onClick={() => window.confirm('Suspend this customer account?') && runCustomerAction('set_account_status', { accountStatus: 'suspended' }, 'Account suspended.')}><Ban size={16} /> Suspend</button>}</div>}
            {!founder && trialExtendable && <div className="admin-operation-row"><div><strong>Extend trial</strong><span>{stripeManaged ? 'Extends an active Stripe trial and records the change.' : 'Extends the internal trial end date.'}</span></div><div className="admin-inline-action"><input type="number" min="1" max="365" value={trialDays} onChange={(event) => setTrialDays(event.target.value)} aria-label="Trial extension days" /><button type="button" className="secondary-button" disabled={busy} onClick={() => runCustomerAction('extend_trial', { days: Number(trialDays || 7) }, 'Trial extended.')}><CalendarClock size={16} /> Extend</button></div></div>}
            {stripeManaged && <div className="admin-operation-row"><div><strong>Refresh subscription from Stripe</strong><span>Pulls the latest status, renewal, payment and schedule information.</span></div><button type="button" className="secondary-button" disabled={busy} onClick={() => runCustomerAction('refresh_stripe_subscription', {}, 'Stripe subscription refreshed.')}><RefreshCw size={16} /> Refresh Stripe</button></div>}
          </div>
        </section>
      </div>

      <div className="admin-detail-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Internal</p><h2>Admin notes</h2></div><span>{detail.notes?.length || 0} note(s)</span></div>
          <form className="admin-note-form" onSubmit={addNote}><textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal customer note" maxLength="4000" /><button type="submit" className="primary-button" disabled={busy || !note.trim()}><Save size={17} /> Save note</button></form>
          <div className="admin-note-list">{(detail.notes || []).map((entry) => <article key={entry.id}><div><strong>{entry.created_by === 'owner_admin' ? 'Owner Admin' : label(entry.created_by)}</strong><small>{dateLabel(entry.created_at)}</small></div><p>{entry.note}</p><button type="button" onClick={() => deleteNote(entry.id)} disabled={busy} aria-label="Delete Admin note"><Trash2 size={16} /></button></article>)}{!detail.notes?.length && <div className="admin-empty">No Admin notes have been added.</div>}</div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Account email</p><h2>Resend appropriate email</h2></div><span>{detail.emailLog?.length || 0} sent/logged</span></div>
          <p className="admin-panel-intro">Only email types appropriate to the current verification, billing, trial and account status are available.</p>
          <div className="admin-email-action"><CustomSelect className="admin-custom-select" value={emailType} ariaLabel="Choose account email" options={detail.emailOptions || []} onChange={setEmailType} /><button type="button" className="primary-button" onClick={sendEmail} disabled={busy || !emailType}><Mail size={17} /> Send email</button></div>
          <div className="admin-email-log">{(detail.emailLog || []).slice(0, 8).map((entry) => <article key={entry.id}><Mail size={17} /><span><strong>{label(entry.email_type)}</strong><small>{entry.recipient_masked || 'Recipient hidden'} · {dateLabel(entry.created_at)}{entry.error_message ? ` · ${entry.error_message}` : ''}</small></span><em className={`admin-status ${statusTone(entry.status)}`}>{entry.status}</em></article>)}{!detail.emailLog?.length && <div className="admin-empty">No Admin account emails have been logged.</div>}</div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">History</p><h2>Customer timeline</h2></div><span>{timeline.length} event(s)</span></div>
        <div className="admin-timeline">{timeline.map((event) => <article key={event.id} className={`admin-timeline-event ${statusTone(event.status)}`}><span className="admin-timeline-dot" /><div><div><strong>{event.title}</strong><em>{label(event.source)}</em></div>{event.detail && <p>{event.detail}</p>}<small>{dateLabel(event.occurredAt)} · {label(event.status || 'recorded')}</small></div></article>)}{!timeline.length && <div className="admin-empty">No customer timeline events have been recorded.</div>}</div>
      </section>

      <div className="admin-detail-grid">
        <section className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Trial and subscription</p><h2>History</h2></div><span>{detail.trialSubscriptionHistory?.length || 0} event(s)</span></div>
          <div className="admin-record-list">{(detail.trialSubscriptionHistory || []).map((item) => <article key={`subscription-history-${item.id}`}><CreditCard size={18} /><div><strong>{item.title}</strong><span>{item.detail || label(item.type)}</span><small>{dateLabel(item.occurredAt)} · {label(item.status || 'recorded')}</small></div></article>)}{!detail.trialSubscriptionHistory?.length && <div className="admin-empty">No trial or subscription history is available.</div>}</div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-heading"><div><p className="eyebrow">Account deletion</p><h2>Status</h2></div><span>{label(summary.deletionStatus || 'none')}</span></div>
          <div className="admin-detail-data-grid"><span><small>Requested</small><strong>{dateLabel(detail.deletion?.requested_at)}</strong></span><span><small>Scheduled</small><strong>{dateLabel(detail.deletion?.scheduled_for)}</strong></span><span><small>Cancelled</small><strong>{dateLabel(detail.deletion?.cancelled_at)}</strong></span><span><small>Completed</small><strong>{dateLabel(detail.deletion?.completed_at)}</strong></span><span><small>Reason</small><strong>{detail.deletion?.reason || '—'}</strong></span><span><small>Contact</small><strong>{detail.deletion?.contact_email_masked || '—'}</strong></span></div>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Stripe and internal billing</p><h2>Billing events</h2></div><span>{detail.billingEvents?.length || 0} event(s)</span></div>
        <div className="admin-event-table">{(detail.billingEvents || []).map((event) => <article key={event.id}><CreditCard size={18} /><div><strong>{label(event.event_type)}</strong><span>{event.amount_minor ? money(event.amount_minor, event.currency) : 'No amount'} · {event.provider || 'internal'}</span><small>{dateLabel(event.occurred_at || event.created_at)}</small></div><em className={`admin-status ${statusTone(event.status)}`}>{event.status || 'recorded'}</em></article>)}{!detail.billingEvents?.length && <div className="admin-empty">No billing events have been recorded.</div>}</div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Encrypted backup operations</p><h2>Sync-health events</h2></div><span>{detail.syncEvents?.length || 0} event(s)</span></div>
        <div className="admin-event-table">{(detail.syncEvents || []).map((event) => <article key={event.id}><Cloud size={18} /><div><strong>{label(event.event_type)}</strong><span>{event.message || `${event.item_count || 0} encrypted item(s)`}</span><small>{dateLabel(event.created_at)}{event.device_id ? ` · Device ${event.device_id}` : ''}</small></div><em className={`admin-status ${statusTone(event.status)}`}>{event.status || 'recorded'}</em></article>)}{!detail.syncEvents?.length && <div className="admin-empty">No sync-health events have been recorded.</div>}</div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Security and accountability</p><h2>Admin and account audit log</h2></div><span>{detail.auditLog?.length || 0} event(s)</span></div>
        <div className="admin-audit-list">{(detail.auditLog || []).map((entry) => <article key={entry.id}><FileText size={18} /><div><strong>{label(entry.action)}</strong><span>{auditSummary(entry)}</span><small>{dateLabel(entry.created_at)}</small></div></article>)}{!detail.auditLog?.length && <div className="admin-empty">No audit entries have been recorded.</div>}</div>
      </section>
    </section>
  );
}
