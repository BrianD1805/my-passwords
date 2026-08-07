import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, Database, HeartPulse, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react';
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
    return { ok: false, message: 'The operational health service could not be reached.' };
  }
}

function dateLabel(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Never';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function titleCase(value) { return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function tone(value) {
  const status = String(value || '').toLowerCase();
  if (['healthy', 'ready', 'success', 'resolved', 'applied'].includes(status)) return 'success';
  if (['warning', 'not_configured', 'not_checked', 'preview'].includes(status)) return 'warning';
  if (['critical', 'attention', 'error', 'failed'].includes(status)) return 'error';
  return 'recorded';
}

function formatValue(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return dateLabel(value);
  return String(value);
}

export default function AdminHealth({ onSessionExpired, setGlobalNotice }) {
  const [data, setData] = useState({ summary: {}, services: {}, events: [], checks: [], stripeCustomers: [], reconciliations: [], retentionPolicy: [], safety: {} });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [stripeTenantId, setStripeTenantId] = useState('');
  const [preview, setPreview] = useState(null);

  async function loadData({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    const result = await requestJson('/.netlify/functions/admin-health');
    if (!quiet) setLoading(false);
    if (!result.ok) {
      if (result.httpStatus === 401) onSessionExpired?.(result.message);
      setNotice(result.message || 'Operational health data could not be loaded.');
      return;
    }
    setData(result);
    setStripeTenantId((current) => current && result.stripeCustomers?.some((row) => row.value === current) ? current : (result.stripeCustomers?.[0]?.value || ''));
  }

  useEffect(() => { loadData(); }, []);

  const latestChecks = useMemo(() => {
    const found = new Map();
    for (const row of data.checks || []) if (!found.has(row.check_type)) found.set(row.check_type, row);
    return [...found.values()];
  }, [data.checks]);

  async function runAction(action, payload = {}, key = action) {
    setBusy(key); setNotice('');
    const result = await requestJson('/.netlify/functions/admin-health', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload })
    });
    setBusy('');
    if (!result.ok) {
      if (result.httpStatus === 401) onSessionExpired?.(result.message);
      setNotice(result.message || 'The health action failed.');
      setGlobalNotice?.(result.message || 'Operational health action failed.');
      await loadData({ quiet: true });
      return result;
    }
    setNotice(result.message || 'Operational health action completed.');
    setGlobalNotice?.(result.message || 'Operational health action completed.');
    await loadData({ quiet: true });
    return result;
  }

  async function previewStripe() {
    if (!stripeTenantId) return;
    const result = await runAction('preview_stripe_reconciliation', { tenantId: stripeTenantId }, 'stripe-preview');
    if (result?.ok) setPreview(result.preview || null);
  }

  async function applyStripe() {
    if (!preview?.runId) return;
    const result = await runAction('apply_stripe_reconciliation', { runId: preview.runId }, 'stripe-apply');
    if (result?.ok) setPreview(null);
  }

  if (loading) return <section className="admin-content"><section className="admin-panel admin-detail-loading"><RefreshCw className="spin-icon" /><strong>Loading operational health</strong></section></section>;

  return (
    <section className="admin-content admin-health-page">
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><p className="eyebrow">Reliability and recovery</p><h2>Health Dashboard</h2></div>
          <div className="admin-health-heading-actions">
            <span className={`admin-status ${tone(data.overallStatus)}`}>{titleCase(data.overallStatus || 'unknown')}</span>
            <button type="button" className="secondary-button" onClick={() => loadData()} disabled={Boolean(busy)}><RefreshCw size={17} /> Refresh</button>
            <button type="button" className="primary-button" onClick={() => runAction('run_health_check', {}, 'health')} disabled={Boolean(busy)}><HeartPulse size={17} /> {busy === 'health' ? 'Checking...' : 'Run health checks now'}</button>
          </div>
        </div>
        <p className="admin-panel-intro">Operational metadata only. Monitoring does not read or store passwords, decrypted vault values, document contents, OTPs, recovery codes or provider secrets.</p>
        {notice && <div className="admin-notice">{notice}</div>}
        <div className="admin-health-summary-grid">
          <article><ShieldCheck /><strong>{data.summary?.openOperationalEvents || 0}</strong><span>Open alerts</span></article>
          <article><XCircle /><strong>{data.summary?.failedStripeWebhooks || 0}</strong><span>Failed Stripe webhooks</span></article>
          <article><AlertTriangle /><strong>{data.summary?.resendFailures || 0}</strong><span>Email failures</span></article>
          <article><Cloud /><strong>{data.summary?.backupFailures || 0}</strong><span>Backup failures</span></article>
          <article><TriangleAlert /><strong>{data.summary?.syncConflicts || 0}</strong><span>Sync conflicts</span></article>
          <article><Database /><strong>{data.summary?.functionFailures || 0}</strong><span>Function failures</span></article>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Services</p><h2>Current operational status</h2></div></div>
        <div className="admin-health-service-grid">
          {Object.entries(data.services || {}).map(([key, service]) => <article key={key}>
            <div><strong>{service.label || titleCase(key)}</strong><span className={`admin-status ${tone(service.status)}`}>{titleCase(service.status || 'unknown')}</span></div>
            {service.latestBackupAt && <small>Latest completed backup: {dateLabel(service.latestBackupAt)}</small>}
            {service.message && <p>{service.message}</p>}
          </article>)}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Scheduled controls</p><h2>Latest check runs</h2></div><span>{latestChecks.length} check type(s)</span></div>
        <div className="admin-event-table">
          {latestChecks.map((row) => <article key={row.id}><RefreshCw size={18} /><div><strong>{titleCase(row.check_type)}</strong><span>{row.issues_found || 0} issue(s) found · {row.items_checked || 0} item(s) checked</span><small>{dateLabel(row.finished_at || row.started_at)} · {titleCase(row.trigger_source)}</small></div><em className={`admin-status ${tone(row.status)}`}>{row.status}</em></article>)}
          {!latestChecks.length && <div className="admin-empty">No scheduled check history yet. Run the health checks once after applying the Ver-0.051 SQL.</div>}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Alerts</p><h2>Operational events</h2></div><span>{(data.events || []).filter((row) => row.status === 'open').length} open</span></div>
        <div className="admin-event-table admin-health-events">
          {(data.events || []).slice(0, 100).map((event) => <article key={event.id}>
            {event.status === 'resolved' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <div><strong>{titleCase(event.event_type)}</strong><span>{event.message || titleCase(event.source)}</span><small>{titleCase(event.source)} · Last seen {dateLabel(event.last_seen_at)} · {event.occurrence_count || 1} occurrence(s){event.error_code ? ` · ${event.error_code}` : ''}</small></div>
            <div className="admin-health-event-actions"><em className={`admin-status ${event.status === 'resolved' ? 'success' : tone(event.severity)}`}>{event.status === 'resolved' ? 'Resolved' : titleCase(event.severity)}</em>{event.status === 'open' && <button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => runAction('resolve_event', { eventId: event.id }, `resolve:${event.id}`)}>Resolve</button>}</div>
          </article>)}
          {!data.events?.length && <div className="admin-empty">No operational events have been recorded.</div>}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Safe billing recovery</p><h2>Stripe reconciliation</h2></div><span className="admin-status success">Read Stripe, update local metadata only</span></div>
        <p className="admin-panel-intro">Preview compares the customer’s already-linked Stripe subscription with My Passwords. Apply can only refresh local billing metadata from that same server-stored Stripe subscription. It cannot create, cancel, upgrade, downgrade or charge a subscription.</p>
        <div className="admin-health-stripe-controls">
          <CustomSelect value={stripeTenantId} ariaLabel="Choose Stripe customer" options={(data.stripeCustomers || []).map((row) => ({ value: row.value, label: `${row.label} · ${row.plan || 'Stripe'} · ${row.status || 'unknown'}` }))} onChange={(value) => { setStripeTenantId(value); setPreview(null); }} />
          <button type="button" className="secondary-button" onClick={previewStripe} disabled={!stripeTenantId || Boolean(busy)}><RotateCcw size={17} /> {busy === 'stripe-preview' ? 'Comparing...' : 'Preview reconciliation'}</button>
        </div>
        {preview && <div className="admin-health-reconciliation-preview">
          <div className="admin-panel-heading"><div><strong>Preview differences</strong><span>Expires {dateLabel(preview.expiresAt)}</span></div><span className={`admin-status ${preview.changes?.length ? 'warning' : 'success'}`}>{preview.changes?.length || 0} difference(s)</span></div>
          {preview.changes?.length ? <div className="admin-health-diff-table">
            <div className="head"><strong>Field</strong><strong>My Passwords</strong><strong>Stripe</strong></div>
            {preview.changes.map((change) => <div key={change.field}><span>{titleCase(change.field)}</span><span>{formatValue(change.local)}</span><span>{formatValue(change.provider)}</span></div>)}
          </div> : <div className="admin-empty">Stripe and My Passwords already match.</div>}
          <div className="admin-health-preview-actions"><button type="button" className="primary-button" onClick={applyStripe} disabled={!preview.changes?.length || Boolean(busy)}>{busy === 'stripe-apply' ? 'Applying...' : 'Apply local metadata reconciliation'}</button><button type="button" className="secondary-button" onClick={() => setPreview(null)} disabled={Boolean(busy)}>Discard preview</button></div>
        </div>}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Retention</p><h2>Operational history rules</h2></div></div>
        <div className="admin-health-retention-grid">{(data.retentionPolicy || []).map((row) => <article key={row.severity}><strong>{row.severity}</strong><span>{row.days} days</span></article>)}</div>
        <p className="admin-panel-intro">The daily cleanup applies only to operational monitoring/check/reconciliation history. Customer vault data and normal billing/account history are not deleted by this cleanup.</p>
      </section>
    </section>
  );
}
