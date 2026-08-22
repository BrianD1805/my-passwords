import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatAppDate } from './dateFormat.js';
import { AlertTriangle, ArrowLeft, Ban, CalendarClock, Check, ChevronRight, ClipboardCopy, Cloud, CreditCard, Database, FileText, Mail, RefreshCw, Save, ShieldCheck, Smartphone, Trash2, UserRoundCheck, UsersRound } from 'lucide-react';
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
  return formatAppDate(value, includeTime, '—');
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

function DetailAccordion({ id, eyebrow, title, meta, icon: Icon = FileText, open, onToggle, children, className = '' }) {
  return (
    <details id={`admin-detail-${id}`} className={`admin-detail-accordion ${className}`.trim()} open={Boolean(open)} onToggle={(event) => onToggle?.(id, event.currentTarget.open)}>
      <summary>
        <span className="admin-detail-accordion-icon"><Icon size={20} /></span>
        <span className="admin-detail-accordion-title"><small>{eyebrow}</small><strong>{title}</strong></span>
        {meta && <span className="admin-detail-accordion-meta">{meta}</span>}
        <ChevronRight size={20} className="admin-detail-accordion-chevron" />
      </summary>
      <div className="admin-detail-accordion-body">{children}</div>
    </details>
  );
}

export default function AdminCustomerDetail({ customerId, onBack, onChanged, onSessionExpired, setGlobalNotice }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [note, setNote] = useState('');
  const [trialDays, setTrialDays] = useState('7');
  const [emailType, setEmailType] = useState('');
  const [supportReport, setSupportReport] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ visible: false, input: '', message: '', busy: false });
  const [openSections, setOpenSections] = useState({ account: true, billing: false, devices: false, operations: false, diagnostics: false, notes: false, email: false, timeline: false, subscriptionHistory: false, deletion: false, billingEvents: false, sync: false, audit: false });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setOpenSections({ account: true, billing: false, devices: false, operations: false, diagnostics: false, notes: false, email: false, timeline: false, subscriptionHistory: false, deletion: false, billingEvents: false, sync: false, audit: false });
    loadDetail();
  }, [customerId]);

  useEffect(() => {
    if (!deleteConfirm.visible) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [deleteConfirm.visible]);

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
    return result;
  }

  async function generateDiagnostics() {
    setBusy(true);
    const result = await requestJson('/.netlify/functions/admin-customer-detail', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'generate_diagnostics', tenantId: customerId })
    });
    setBusy(false);
    if (result.httpStatus === 401 && onSessionExpired) { onSessionExpired(result.message || 'Admin sign-in is required.'); return; }
    setNotice(result.message || (result.ok ? 'Metadata-only support diagnostics generated.' : 'Support diagnostics could not be generated.'));
    if (result.ok) setSupportReport(result.report || null);
  }

  async function copyDiagnostics() {
    if (!supportReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(supportReport, null, 2));
      setNotice('Support diagnostics copied.');
    } catch {
      setNotice('Could not copy diagnostics automatically. Select the report text and copy it manually.');
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

  function openHardDeleteAccount() {
    setDeleteConfirm({ visible: true, input: '', message: '', busy: false });
  }

  function closeHardDeleteAccount() {
    if (deleteConfirm.busy) return;
    setDeleteConfirm({ visible: false, input: '', message: '', busy: false });
  }

  async function hardDeleteAccount() {
    if (String(deleteConfirm.input || '').trim().toUpperCase() !== 'DELETE') {
      setDeleteConfirm((current) => ({ ...current, message: 'Type DELETE in the box to confirm this permanent action.' }));
      return;
    }
    setBusy(true);
    setDeleteConfirm((current) => ({ ...current, busy: true, message: '' }));
    const result = await requestJson('/.netlify/functions/admin-customer-detail', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'hard_delete_account', tenantId: customerId, confirmText: 'DELETE' })
    });
    setBusy(false);
    if (result.httpStatus === 401 && onSessionExpired) {
      setDeleteConfirm((current) => ({ ...current, busy: false, message: result.message || 'Admin sign-in is required.' }));
      onSessionExpired(result.message || 'Admin sign-in is required.');
      return;
    }
    setNotice(result.message || (result.ok ? 'Account permanently deleted.' : 'Account deletion failed.'));
    if (setGlobalNotice) setGlobalNotice(result.message || '');
    if (result.ok) {
      setDeleteConfirm({ visible: false, input: '', message: '', busy: false });
      if (onChanged) await onChanged();
      onBack?.();
      return;
    }
    setDeleteConfirm((current) => ({ ...current, busy: false, message: result.message || 'Account deletion failed.' }));
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

  function toggleSection(id, open) {
    setOpenSections((current) => ({ ...current, [id]: open }));
  }

  function openSection(id) {
    setOpenSections((current) => ({ ...current, [id]: true }));
    window.requestAnimationFrame(() => document.getElementById(`admin-detail-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (loading) {
    return <section className="admin-content"><div className="admin-panel admin-detail-loading"><RefreshCw className="spin-icon" /><strong>Loading customer details</strong></div></section>;
  }

  if (!detail) {
    return <section className="admin-content"><div className="admin-panel"><button type="button" className="secondary-button" onClick={onBack}><ArrowLeft size={17} /> Back to customers</button><div className="admin-notice error">{notice || 'Customer details are unavailable.'}</div></div></section>;
  }

  return (
    <>
    <section className="admin-content admin-customer-detail-page">
      <section className="admin-detail-header admin-panel">
        <div className="admin-detail-heading">
          <button type="button" className="admin-detail-back" onClick={onBack}><ArrowLeft size={19} /> Back to customers</button>
          <div>
            <p className="eyebrow">Customer</p>
            <h2>{tenant.account_name || tenant.name || 'Customer account'}</h2>
            <span>{owner.display_name || 'Account owner'} · {owner.email || 'No email'} · {customerId}</span>
          </div>
        </div>
        <div className="admin-detail-statuses">
          <button type="button" className="secondary-button admin-detail-refresh" onClick={loadDetail} disabled={loading || busy}><RefreshCw size={16} className={loading ? 'spin-icon' : ''} /> Refresh</button>
          <span className={`admin-status ${statusTone(tenant.account_status)}`}>{label(tenant.account_status || 'active')}</span>
          <span className={`admin-status ${statusTone(subscription?.status || tenant.plan_status)}`}>{label(subscription?.status || tenant.plan_status)}</span>
        </div>
      </section>

      {notice && <div className={`admin-notice ${notice.toLowerCase().includes('failed') || notice.toLowerCase().includes('could not') ? 'error' : ''}`}>{notice}</div>}

      <section className="admin-security-boundary admin-security-boundary-compact">
        <ShieldCheck size={20} />
        <div><strong>Operational metadata only</strong><span>{detail.securityBoundary?.message}</span></div>
      </section>

      <div className="admin-detail-metrics">
        <button type="button" className="admin-detail-metric" onClick={() => openSection('devices')}>
          <UserRoundCheck />
          <small>Last successful sign-in</small>
          <strong>{dateLabel(summary.lastSignInAt)}</strong>
          <span>{summary.activeSessionCount || 0} active session(s)</span>
        </button>
        <button type="button" className="admin-detail-metric" onClick={() => openSection('sync')}>
          <Cloud />
          <small>Last successful backup</small>
          <strong>{dateLabel(summary.lastSuccessfulBackupAt)}</strong>
          <span>{summary.lastSuccessfulBackupItems || 0} vault item(s) in snapshot</span>
          <em>{summary.storedDocumentCount || 0} document(s) · {summary.storedPictureCount || 0} picture(s) stored now</em>
        </button>
        <button type="button" className="admin-detail-metric admin-verification-metric" onClick={() => openSection('account')}>
          <ShieldCheck />
          <small>Verification</small>
          <span className={`admin-verification-line ${summary.emailVerified ? 'verified' : 'attention'}`}>{summary.emailVerified ? <Check size={18} /> : <AlertTriangle size={18} />}<strong>{summary.emailVerified ? 'Email verified' : 'Email not verified'}</strong></span>
          <span className={`admin-verification-line ${owner.phone_e164 && summary.phoneVerified ? 'verified' : 'attention'}`}>{owner.phone_e164 && summary.phoneVerified ? <Check size={18} /> : <AlertTriangle size={18} />}<strong>{owner.phone_e164 ? (summary.phoneVerified ? 'Mobile verified' : 'Mobile not verified') : 'No mobile added'}</strong></span>
        </button>
        <button type="button" className="admin-detail-metric" onClick={() => openSection('billing')}>
          <CreditCard />
          <small>Plan and billing</small>
          <strong>{detail.plan?.display_name || label(tenant.plan_code)}</strong>
          <span>{label(subscription?.status || tenant.plan_status || 'not started')}</span>
        </button>
      </div>

      <div className="admin-customer-section-heading"><span>Account and subscription</span><small>Core customer information first</small></div>

      <DetailAccordion id="account" eyebrow="Account" title="Profile and verification" meta={`${detail.users?.length || 0} user(s)`} icon={UserRoundCheck} open={openSections.account} onToggle={toggleSection}>
        <div className="admin-detail-data-grid">
          <span><small>Account created</small><strong>{dateLabel(tenant.created_at)}</strong></span>
          <span><small>Onboarding</small><strong>{label(owner.onboarding_status || (tenant.onboarding_completed_at ? 'complete' : 'pending'))}</strong></span>
          <span><small>Email</small><strong>{owner.email || '—'}</strong><em className={owner.email_verified ? 'verified-text' : 'attention-text'}>{owner.email_verified ? 'Verified' : 'Not verified'}</em></span>
          <span><small>Mobile</small><strong>{owner.phone_e164 || '—'}</strong><em className={owner.phone_e164 && owner.phone_verified ? 'verified-text' : 'attention-text'}>{owner.phone_e164 ? (owner.phone_verified ? 'Verified' : 'Not verified') : 'Not added'}</em></span>
          <span><small>Last verification</small><strong>{dateLabel(summary.lastVerificationAt)}</strong></span>
          <span><small>Verified devices</small><strong>{summary.verifiedDeviceCount || 0}</strong></span>
          <span><small>Recovery last used</small><strong>{dateLabel(owner.account_recovery_last_verified_at)}</strong></span>
          <span><small>Account status</small><strong>{label(tenant.account_status || 'active')}</strong></span>
        </div>
      </DetailAccordion>

      <DetailAccordion id="billing" eyebrow="Subscription" title="Plan and billing" meta={label(subscription?.status || tenant.plan_status || 'not started')} icon={CreditCard} open={openSections.billing} onToggle={toggleSection}>
        <div className="admin-detail-data-grid">
          <span><small>Plan</small><strong>{detail.plan?.display_name || label(tenant.plan_code)}</strong></span>
          <span><small>Billing interval</small><strong>{subscription?.billing_interval ? label(subscription.billing_interval) : '—'}</strong></span>
          <span><small>Current price</small><strong>{subscription && subscription.price_minor !== null && subscription.price_minor !== undefined ? money(subscription.price_minor, subscription.currency) : '—'}</strong></span>
          <span><small>Current period ends</small><strong>{dateLabel(subscription?.current_period_end)}</strong></span>
          <span><small>Next invoice</small><strong>{subscription && subscription.next_invoice_amount_minor !== null && subscription.next_invoice_amount_minor !== undefined ? `${money(subscription.next_invoice_amount_minor, subscription.next_invoice_currency || subscription.currency)} · ${dateLabel(subscription.next_invoice_at, false)}` : '—'}</strong></span>
          <span><small>Last Stripe refresh</small><strong>{dateLabel(subscription?.last_stripe_sync_at)}</strong></span>
          <span><small>Payment status</small><strong>{label(subscription?.status || tenant.plan_status || 'not started')}</strong></span>
          <span><small>Trial ends</small><strong>{dateLabel(subscription?.trial_ends_at || tenant.trial_ends_at)}</strong></span>
        </div>
      </DetailAccordion>

      <DetailAccordion id="devices" eyebrow="Access" title="Devices and sessions" meta={`${detail.devices?.length || 0} device(s)`} icon={Smartphone} open={openSections.devices} onToggle={toggleSection}>
        <div className="admin-record-list admin-device-session-list">
          {(detail.devices || []).slice(0, 30).map((device) => <article key={`device-${device.id}`}><Smartphone size={18} /><div><strong>{device.device_name || device.device_type || 'Verified device'}</strong><span>{[device.platform, device.browser].filter(Boolean).join(' · ') || 'Device details unavailable'}</span><small>Last seen {dateLabel(device.last_seen_at)} · Verified {dateLabel(device.last_verified_at)}{device.revoked_at ? ` · Revoked ${dateLabel(device.revoked_at)}` : ''}</small></div><em className={`admin-status ${device.revoked_at ? 'error' : 'success'}`}>{device.revoked_at ? 'Revoked' : 'Verified'}</em></article>)}
          {!detail.devices?.length && <div className="admin-empty">No verified-device records are available.</div>}
        </div>
        <div className="admin-subsection-heading"><strong>Recent sessions</strong><span>{detail.sessions?.length || 0} recorded</span></div>
        <div className="admin-record-list admin-device-session-list">
          {(detail.sessions || []).slice(0, 30).map((session) => <article key={`session-${session.id}`}><UsersRound size={18} /><div><strong>{label(session.status || 'recorded')} session</strong><span>{session.device_id ? `Device ${session.device_id}` : 'Device identifier unavailable'}</span><small>Issued {dateLabel(session.issued_at || session.created_at)} · Last seen {dateLabel(session.last_seen_at)} · Expires {dateLabel(session.expires_at)}</small></div><em className={`admin-status ${statusTone(session.status)}`}>{label(session.status || 'recorded')}</em></article>)}
          {!detail.sessions?.length && <div className="admin-empty">No account sessions are available.</div>}
        </div>
      </DetailAccordion>

      <div className="admin-customer-section-heading"><span>Admin controls and support</span><small>Actions are audited</small></div>

      <DetailAccordion id="operations" eyebrow="Controls" title="Account operations" meta="Audited" icon={ShieldCheck} open={openSections.operations} onToggle={toggleSection}>
        <div className="admin-operation-stack">
          {!founder && <div className="admin-operation-row"><div><strong>{tenant.account_status === 'suspended' ? 'Reactivate account' : 'Suspend account'}</strong><span>Controls access to account services. It does not read or alter the encrypted vault.</span></div>{tenant.account_status === 'suspended' ? <button type="button" className="secondary-button" disabled={busy} onClick={() => runCustomerAction('set_account_status', { accountStatus: 'active' }, 'Account reactivated.')}><UserRoundCheck size={16} /> Reactivate</button> : <button type="button" className="secondary-button danger-soft" disabled={busy} onClick={() => window.confirm('Suspend this customer account?') && runCustomerAction('set_account_status', { accountStatus: 'suspended' }, 'Account suspended.')}><Ban size={16} /> Suspend</button>}</div>}
          {!founder && trialExtendable && <div className="admin-operation-row"><div><strong>Extend trial</strong><span>{stripeManaged ? 'Extends an active Stripe trial and records the change.' : 'Extends the internal trial end date.'}</span></div><div className="admin-inline-action"><input type="number" min="1" max="365" value={trialDays} onChange={(event) => setTrialDays(event.target.value)} aria-label="Trial extension days" /><button type="button" className="secondary-button" disabled={busy} onClick={() => runCustomerAction('extend_trial', { days: Number(trialDays || 7) }, 'Trial extended.')}><CalendarClock size={16} /> Extend</button></div></div>}
          {stripeManaged && <div className="admin-operation-row"><div><strong>Refresh subscription from Stripe</strong><span>Pulls the latest status, renewal, payment and schedule information.</span></div><button type="button" className="secondary-button" disabled={busy} onClick={() => runCustomerAction('refresh_stripe_subscription', {}, 'Stripe subscription refreshed.')}><RefreshCw size={16} /> Refresh Stripe</button></div>}
          {!founder && <div className="admin-operation-row admin-hard-delete-row"><div><strong>Delete account permanently</strong><span>Removes the customer account and server-side account data, cancels an active Stripe subscription first where applicable, then emails the account holder that the account was deleted.</span></div><button type="button" className="secondary-button danger-soft" disabled={busy} onClick={openHardDeleteAccount}><Trash2 size={16} /> Delete account</button></div>}
        </div>
      </DetailAccordion>

      <DetailAccordion id="diagnostics" eyebrow="Customer support" title="Safe diagnostics report" meta="Metadata only" icon={FileText} open={openSections.diagnostics} onToggle={toggleSection}>
        <p className="admin-panel-intro">Generate a support report for account, session, device, sync, backup, billing and operational status. Passwords, vault contents, encrypted payloads, document contents, OTPs and recovery codes are excluded.</p>
        <div className="admin-support-diagnostics-actions"><button type="button" className="secondary-button" onClick={generateDiagnostics} disabled={busy}><FileText size={17} /> Generate diagnostics</button>{supportReport && <button type="button" className="secondary-button" onClick={copyDiagnostics} disabled={busy}><ClipboardCopy size={17} /> Copy report</button>}</div>
        {supportReport && <pre className="admin-support-diagnostics-report">{JSON.stringify(supportReport, null, 2)}</pre>}
      </DetailAccordion>

      <DetailAccordion id="notes" eyebrow="Internal" title="Admin notes" meta={`${detail.notes?.length || 0} note(s)`} icon={Save} open={openSections.notes} onToggle={toggleSection}>
        <form className="admin-note-form" onSubmit={addNote}><textarea rows="3" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal customer note" maxLength="4000" /><button type="submit" className="primary-button" disabled={busy || !note.trim()}><Save size={17} /> Save note</button></form>
        <div className="admin-note-list">{(detail.notes || []).map((entry) => <article key={entry.id}><div><strong>{entry.created_by === 'owner_admin' ? 'Owner Admin' : label(entry.created_by)}</strong><small>{dateLabel(entry.created_at)}</small></div><p>{entry.note}</p><button type="button" onClick={() => deleteNote(entry.id)} disabled={busy} aria-label="Delete Admin note"><Trash2 size={16} /></button></article>)}{!detail.notes?.length && <div className="admin-empty">No Admin notes have been added.</div>}</div>
      </DetailAccordion>

      <DetailAccordion id="email" eyebrow="Account email" title="Resend appropriate email" meta={`${detail.emailLog?.length || 0} sent/logged`} icon={Mail} open={openSections.email} onToggle={toggleSection}>
        <p className="admin-panel-intro">Only email types appropriate to the current verification, billing, trial and account status are available.</p>
        <div className="admin-email-action"><CustomSelect className="admin-custom-select" value={emailType} ariaLabel="Choose account email" options={detail.emailOptions || []} onChange={setEmailType} /><button type="button" className="primary-button" onClick={sendEmail} disabled={busy || !emailType}><Mail size={17} /> Send email</button></div>
        <div className="admin-email-log">{(detail.emailLog || []).slice(0, 12).map((entry) => <article key={entry.id}><Mail size={17} /><span><strong>{label(entry.email_type)}</strong><small>{entry.recipient_masked || 'Recipient hidden'} · {dateLabel(entry.created_at)}{entry.error_message ? ` · ${entry.error_message}` : ''}</small></span><em className={`admin-status ${statusTone(entry.status)}`}>{entry.status}</em></article>)}{!detail.emailLog?.length && <div className="admin-empty">No Admin account emails have been logged.</div>}</div>
      </DetailAccordion>

      <div className="admin-customer-section-heading"><span>History and operational records</span><small>Expand only what you need</small></div>

      <DetailAccordion id="timeline" eyebrow="History" title="Customer timeline" meta={`${timeline.length} event(s)`} icon={CalendarClock} open={openSections.timeline} onToggle={toggleSection}>
        <div className="admin-timeline">{timeline.map((event) => <article key={event.id} className={`admin-timeline-event ${statusTone(event.status)}`}><span className="admin-timeline-dot" /><div><div><strong>{event.title}</strong><em>{label(event.source)}</em></div>{event.detail && <p>{event.detail}</p>}<small>{dateLabel(event.occurredAt)} · {label(event.status || 'recorded')}</small></div></article>)}{!timeline.length && <div className="admin-empty">No customer timeline events have been recorded.</div>}</div>
      </DetailAccordion>

      <DetailAccordion id="subscriptionHistory" eyebrow="Trial and subscription" title="Subscription history" meta={`${detail.trialSubscriptionHistory?.length || 0} event(s)`} icon={CreditCard} open={openSections.subscriptionHistory} onToggle={toggleSection}>
        <div className="admin-record-list">{(detail.trialSubscriptionHistory || []).map((item) => <article key={`subscription-history-${item.id}`}><CreditCard size={18} /><div><strong>{item.title}</strong><span>{item.detail || label(item.type)}</span><small>{dateLabel(item.occurredAt)} · {label(item.status || 'recorded')}</small></div></article>)}{!detail.trialSubscriptionHistory?.length && <div className="admin-empty">No trial or subscription history is available.</div>}</div>
      </DetailAccordion>

      <DetailAccordion id="deletion" eyebrow="Account deletion" title="Deletion status" meta={label(summary.deletionStatus || 'none')} icon={Trash2} open={openSections.deletion} onToggle={toggleSection}>
        <div className="admin-detail-data-grid"><span><small>Requested</small><strong>{dateLabel(detail.deletion?.requested_at)}</strong></span><span><small>Scheduled</small><strong>{dateLabel(detail.deletion?.scheduled_for)}</strong></span><span><small>Cancelled</small><strong>{dateLabel(detail.deletion?.cancelled_at)}</strong></span><span><small>Completed</small><strong>{dateLabel(detail.deletion?.completed_at)}</strong></span><span><small>Reason</small><strong>{detail.deletion?.reason || '—'}</strong></span><span><small>Contact</small><strong>{detail.deletion?.contact_email_masked || '—'}</strong></span></div>
      </DetailAccordion>

      <DetailAccordion id="billingEvents" eyebrow="Stripe and internal billing" title="Billing events" meta={`${detail.billingEvents?.length || 0} event(s)`} icon={CreditCard} open={openSections.billingEvents} onToggle={toggleSection}>
        <div className="admin-event-table">{(detail.billingEvents || []).map((event) => <article key={event.id}><CreditCard size={18} /><div><strong>{label(event.event_type)}</strong><span>{event.amount_minor ? money(event.amount_minor, event.currency) : 'No amount'} · {event.provider || 'internal'}</span><small>{dateLabel(event.occurred_at || event.created_at)}</small></div><em className={`admin-status ${statusTone(event.status)}`}>{event.status || 'recorded'}</em></article>)}{!detail.billingEvents?.length && <div className="admin-empty">No billing events have been recorded.</div>}</div>
      </DetailAccordion>

      <DetailAccordion id="sync" eyebrow="Encrypted backup operations" title="Backup and sync" meta={`${detail.syncEvents?.length || 0} event(s)`} icon={Cloud} open={openSections.sync} onToggle={toggleSection}>
        <div className="admin-backup-explainer"><Database size={19} /><div><strong>{summary.lastSuccessfulBackupItems || 0} vault item(s) were recorded in the last successful cloud snapshot.</strong><span>That snapshot item count includes document and picture entries present in the encrypted vault at that backup. Documents and pictures are not added to the total a second time.</span><small>Current encrypted file storage: {summary.storedDocumentCount || 0} document(s) · {summary.storedPictureCount || 0} picture(s). If a device currently shows a higher vault-item total, those newer changes have not yet appeared in the last successful snapshot shown here.</small></div></div>
        <div className="admin-event-table">{(detail.syncEvents || []).map((event) => <article key={event.id}><Cloud size={18} /><div><strong>{label(event.event_type)}</strong><span>{event.message || `${event.item_count || 0} encrypted item(s)`}</span><small>{dateLabel(event.created_at)}{event.device_id ? ` · Device ${event.device_id}` : ''}</small></div><em className={`admin-status ${statusTone(event.status)}`}>{event.status || 'recorded'}</em></article>)}{!detail.syncEvents?.length && <div className="admin-empty">No sync-health events have been recorded.</div>}</div>
      </DetailAccordion>

      <DetailAccordion id="audit" eyebrow="Security and accountability" title="Admin and account audit log" meta={`${detail.auditLog?.length || 0} event(s)`} icon={FileText} open={openSections.audit} onToggle={toggleSection}>
        <div className="admin-audit-list">{(detail.auditLog || []).map((entry) => <article key={entry.id}><FileText size={18} /><div><strong>{label(entry.action)}</strong><span>{auditSummary(entry)}</span><small>{dateLabel(entry.created_at)}</small></div></article>)}{!detail.auditLog?.length && <div className="admin-empty">No audit entries have been recorded.</div>}</div>
      </DetailAccordion>
    </section>
    {deleteConfirm.visible && createPortal(
      <div className="admin-modal-overlay admin-delete-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeHardDeleteAccount(); }}>
        <section className="admin-plan-window admin-delete-confirm-window" role="dialog" aria-modal="true" aria-labelledby="admin-delete-confirm-title">
          <header className="admin-plan-window-header admin-delete-confirm-header">
            <div><p className="eyebrow">Permanent account deletion</p><h2 id="admin-delete-confirm-title"><AlertTriangle size={23} /> Delete customer account</h2></div>
            <button type="button" className="admin-window-close" onClick={closeHardDeleteAccount} disabled={deleteConfirm.busy} aria-label="Close delete account warning">×</button>
          </header>
          <div className="admin-plan-window-body admin-delete-confirm-body">
            <div className="admin-delete-danger-card"><AlertTriangle size={24} /><div><strong>This action cannot be undone.</strong><p>Password-Encrypt will permanently remove <b>{tenant.account_name || tenant.name || 'this customer account'}</b>, its cloud data, sessions, billing metadata and Trusted Person flow. An active Stripe subscription is cancelled first where applicable.</p></div></div>
            <label className="admin-delete-confirm-field"><span>Type <strong>DELETE</strong> to confirm</span><input autoFocus value={deleteConfirm.input} onChange={(event) => setDeleteConfirm((current) => ({ ...current, input: event.target.value, message: '' }))} disabled={deleteConfirm.busy} autoComplete="off" /></label>
            {deleteConfirm.message && <div className="admin-delete-confirm-message" role="alert">{deleteConfirm.message}</div>}
          </div>
          <footer className="admin-plan-window-footer admin-delete-confirm-footer">
            <button type="button" className="secondary-button" onClick={closeHardDeleteAccount} disabled={deleteConfirm.busy}>Cancel</button>
            <button type="button" className="primary-button admin-delete-confirm-button" onClick={hardDeleteAccount} disabled={deleteConfirm.busy || String(deleteConfirm.input || '').trim().toUpperCase() !== 'DELETE'}>{deleteConfirm.busy ? <RefreshCw size={17} className="spin-icon" /> : <Trash2 size={17} />} {deleteConfirm.busy ? 'Deleting account...' : 'Delete account permanently'}</button>
          </footer>
        </section>
      </div>,
      document.body
    )}
    </>
  );
}
