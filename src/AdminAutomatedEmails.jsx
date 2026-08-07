import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Mail, Play, RefreshCw, RotateCcw, Search, Send, XCircle } from 'lucide-react';
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
    return { ok: false, message: 'The automated email service could not be reached. Please try again.' };
  }
}

function dateLabel(value, includeTime = true) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Never';
  return new Intl.DateTimeFormat('en-GB', includeTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function titleCase(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rowDate(row) {
  return row.sentAt || row.lastAttemptAt || row.createdAt || '';
}

export default function AdminAutomatedEmails({ onSessionExpired, setGlobalNotice, onOpenCustomer }) {
  const [data, setData] = useState({ emailRows: [], processorRuns: [], summary: {}, customerOptions: [], emailTypes: [], schedules: {}, resendConfigured: false, lastLifecycleSuccess: null, lastEmergencySuccess: null });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [testEmail, setTestEmail] = useState('');

  async function loadData({ quiet = false } = {}) {
    if (!quiet) setLoading(true);
    const result = await requestJson('/.netlify/functions/admin-automated-emails');
    if (!quiet) setLoading(false);
    if (!result.ok) {
      if (result.httpStatus === 401) onSessionExpired?.(result.message);
      setNotice(result.message || 'Could not load automated email operations.');
      return;
    }
    setData(result);
    setNotice('');
  }

  useEffect(() => { loadData(); }, []);

  const typeOptions = useMemo(() => [{ value: 'all', label: 'All email types' }, ...(data.emailTypes || []).map((value) => ({ value, label: titleCase(value) }))], [data.emailTypes]);
  const customerOptions = useMemo(() => [{ value: 'all', label: 'All customers' }, ...(data.customerOptions || [])], [data.customerOptions]);
  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'sent', label: 'Sent' },
    { value: 'failed', label: 'Failed' },
    { value: 'pending', label: 'Pending' },
    { value: 'retrying', label: 'Retrying' }
  ];

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : 0;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return (data.emailRows || []).filter((row) => {
      const occurred = rowDate(row) ? new Date(rowDate(row)).getTime() : 0;
      if (customerFilter !== 'all' && row.tenantId !== customerFilter) return false;
      if (typeFilter !== 'all' && row.emailType !== typeFilter) return false;
      if (statusFilter === 'retrying' && !row.retrying) return false;
      if (statusFilter !== 'all' && statusFilter !== 'retrying' && row.status !== statusFilter) return false;
      if (Number.isFinite(fromMs) && occurred < fromMs) return false;
      if (Number.isFinite(toMs) && occurred > toMs) return false;
      if (!query) return true;
      return [row.customerName, row.recipientMasked, row.subject, row.emailType, row.errorMessage]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query));
    });
  }, [data.emailRows, search, customerFilter, typeFilter, statusFilter, fromDate, toDate]);

  const failedRows = useMemo(() => (data.emailRows || []).filter((row) => row.rawStatus === 'failed'), [data.emailRows]);

  async function runAction(action, payload = {}, busyKey = action) {
    setBusyAction(busyKey);
    setNotice('');
    const result = await requestJson('/.netlify/functions/admin-automated-emails', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload })
    });
    setBusyAction('');
    if (!result.ok) {
      if (result.httpStatus === 401) onSessionExpired?.(result.message);
      setNotice(result.message || 'The automated email action could not be completed.');
      setGlobalNotice?.(result.message || 'Automated email action failed.');
      await loadData({ quiet: true });
      return result;
    }
    setNotice(result.message || 'Automated email action completed.');
    setGlobalNotice?.(result.message || 'Automated email action completed.');
    await loadData({ quiet: true });
    return result;
  }

  async function retryEmail(row) {
    if (!row?.id || !row.retryAvailable) return;
    await runAction('retry_email', { emailId: row.id }, `retry:${row.id}`);
  }

  async function sendTest(event) {
    event.preventDefault();
    if (!testEmail.trim()) return;
    const result = await runAction('send_test_email', { email: testEmail.trim() }, 'test_email');
    if (result?.ok) setTestEmail('');
  }

  if (loading) {
    return <section className="admin-content"><section className="admin-panel admin-email-loading"><RefreshCw className="spin-icon" /><strong>Loading automated email operations</strong></section></section>;
  }

  return (
    <section className="admin-content admin-email-page">
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><p className="eyebrow">Customer communications</p><h2>Automated Emails</h2></div>
          <button type="button" className="secondary-button" onClick={() => loadData()} disabled={Boolean(busyAction)}><RefreshCw size={17} /> Refresh</button>
        </div>
        <p className="admin-panel-intro">Monitor lifecycle email delivery and safely run the same processors used by the published schedules. No vault contents are available to these controls.</p>
        {notice && <div className="admin-notice">{notice}</div>}

        <div className="admin-email-status-grid">
          <article className="sent"><CheckCircle2 /><strong>{data.summary?.sent || 0}</strong><span>Sent</span></article>
          <article className="failed"><XCircle /><strong>{data.summary?.failed || 0}</strong><span>Failed</span></article>
          <article className="pending"><Clock3 /><strong>{data.summary?.pending || 0}</strong><span>Pending</span></article>
          <article className="retrying"><RotateCcw /><strong>{data.summary?.retrying || 0}</strong><span>Retrying</span></article>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Processors</p><h2>Schedules and manual checks</h2></div><span className={`admin-status ${data.resendConfigured ? 'success' : 'warning'}`}>{data.resendConfigured ? 'Resend configured' : 'Email not configured'}</span></div>
        <div className="admin-email-processor-grid">
          <article>
            <div className="admin-email-processor-title"><CalendarClock size={20} /><div><strong>Customer lifecycle</strong><span>{data.schedules?.lifecycle?.schedule || 'Hourly'}</span></div></div>
            <p>Last successful run: <strong>{dateLabel(data.lastLifecycleSuccess?.finishedAt)}</strong></p>
            {data.lastLifecycleSuccess && <small>{data.lastLifecycleSuccess.itemsChecked || 0} account(s) checked · {data.lastLifecycleSuccess.emailActions || 0} email action(s)</small>}
            <button type="button" className="primary-button" onClick={() => runAction('run_lifecycle_processor', {}, 'lifecycle')} disabled={Boolean(busyAction)}><Play size={17} /> {busyAction === 'lifecycle' ? 'Running...' : 'Run lifecycle email check now'}</button>
          </article>
          <article>
            <div className="admin-email-processor-title"><CalendarClock size={20} /><div><strong>Emergency Access release</strong><span>{data.schedules?.emergency?.schedule || 'Every 5 minutes'}</span></div></div>
            <p>Last successful run: <strong>{dateLabel(data.lastEmergencySuccess?.finishedAt)}</strong></p>
            {data.lastEmergencySuccess && <small>{data.lastEmergencySuccess.itemsChecked || 0} due request(s) checked · {data.lastEmergencySuccess.emailActions || 0} action(s)</small>}
            <button type="button" className="primary-button" onClick={() => runAction('run_emergency_processor', {}, 'emergency')} disabled={Boolean(busyAction)}><Play size={17} /> {busyAction === 'emergency' ? 'Running...' : 'Run Emergency Access release check now'}</button>
          </article>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Safe delivery test</p><h2>Send test email</h2></div><Mail size={22} /></div>
        <p className="admin-panel-intro">This verifies the configured Resend sender without changing any customer's trial, subscription, account status, verification status or lifecycle.</p>
        <form className="admin-email-test-form" onSubmit={sendTest}>
          <label>Test recipient<input type="email" value={testEmail} onChange={(event) => setTestEmail(event.target.value)} placeholder="name@example.com" required /></label>
          <button type="submit" className="secondary-button" disabled={Boolean(busyAction) || !data.resendConfigured}><Send size={17} /> {busyAction === 'test_email' ? 'Sending...' : 'Send test email'}</button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Needs attention</p><h2>Failed emails</h2></div><span>{failedRows.length} failure(s)</span></div>
        <div className="admin-email-failed-list">
          {failedRows.map((row) => (
            <article key={`failed-${row.id}`}>
              <AlertTriangle size={19} />
              <div><strong>{titleCase(row.emailType)}</strong><span>{row.customerName} · {row.recipientMasked || 'Recipient unavailable'}</span><small>{row.errorMessage || 'No provider error detail was returned.'} · Attempt {row.attempts || 0} · {dateLabel(row.lastAttemptAt || row.createdAt)}</small></div>
              {row.retryAvailable ? <button type="button" className="secondary-button" onClick={() => retryEmail(row)} disabled={Boolean(busyAction)}><RotateCcw size={16} /> {busyAction === `retry:${row.id}` ? 'Retrying...' : 'Retry'}</button> : <span className="admin-email-retry-limit">{row.tenantId ? 'Retry limit reached' : 'Run a new test'}</span>}
            </article>
          ))}
          {!failedRows.length && <div className="admin-empty">No failed automated emails need attention.</div>}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Delivery history</p><h2>Customer email history</h2></div><span>{filteredRows.length} of {data.emailRows?.length || 0}</span></div>
        <div className="admin-email-filters">
          <label className="admin-customer-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer, subject or recipient" /></label>
          <CustomSelect className="admin-custom-select" value={customerFilter} ariaLabel="Filter automated emails by customer" options={customerOptions} onChange={setCustomerFilter} />
          <CustomSelect className="admin-custom-select" value={typeFilter} ariaLabel="Filter automated emails by type" options={typeOptions} onChange={setTypeFilter} />
          <CustomSelect className="admin-custom-select" value={statusFilter} ariaLabel="Filter automated emails by status" options={statusOptions} onChange={setStatusFilter} />
          <label className="admin-email-date-filter"><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
          <label className="admin-email-date-filter"><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        </div>
        <div className="admin-email-history-list">
          {filteredRows.map((row) => (
            <article key={row.id}>
              <div className="admin-email-history-icon"><Mail size={18} /></div>
              <div className="admin-email-history-main">
                <strong>{titleCase(row.emailType)}</strong>
                <span>{row.customerName} · {row.recipientMasked || 'Recipient unavailable'}</span>
                <small>{row.subject || 'Customer email'} · Attempt {row.attempts || 0} · {dateLabel(rowDate(row))}</small>
                {row.errorMessage && <small className="admin-email-error-detail">{row.errorMessage}</small>}
              </div>
              <div className="admin-email-history-actions">
                <span className={`admin-status ${row.displayStatus === 'sent' ? 'success' : row.displayStatus === 'failed' ? 'error' : 'warning'}`}>{titleCase(row.displayStatus)}</span>
                {row.tenantId && <button type="button" className="admin-email-customer-link" onClick={() => onOpenCustomer?.(row.tenantId)}>Open customer</button>}
                {row.retryAvailable && <button type="button" className="admin-email-customer-link" onClick={() => retryEmail(row)} disabled={Boolean(busyAction)}>Retry</button>}
              </div>
            </article>
          ))}
          {!filteredRows.length && <div className="admin-empty">No email deliveries match the selected filters.</div>}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Processor history</p><h2>Recent processor runs</h2></div><span>{data.processorRuns?.length || 0} run(s)</span></div>
        <div className="admin-email-run-list">
          {(data.processorRuns || []).slice(0, 30).map((run) => (
            <article key={run.id}>
              {run.status === 'success' ? <CheckCircle2 size={18} /> : run.status === 'failed' ? <XCircle size={18} /> : <Clock3 size={18} />}
              <div><strong>{run.processorType === 'customer_lifecycle' ? 'Customer lifecycle' : 'Emergency Access release'}</strong><span>{titleCase(run.triggerSource)} run · {run.itemsChecked || 0} checked · {run.emailActions || 0} action(s)</span><small>{dateLabel(run.finishedAt || run.startedAt)}{run.errorMessage ? ` · ${run.errorMessage}` : ''}</small></div>
              <span className={`admin-status ${run.status === 'success' ? 'success' : run.status === 'failed' ? 'error' : 'warning'}`}>{titleCase(run.status)}</span>
            </article>
          ))}
          {!data.processorRuns?.length && <div className="admin-empty">No processor runs have been recorded yet. Run all required Supabase migrations through Ver-0.050, then use one of the manual checks above.</div>}
        </div>
      </section>
    </section>
  );
}
