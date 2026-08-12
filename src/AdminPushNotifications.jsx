import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, RefreshCw, Save, Send, ShieldCheck } from 'lucide-react';
import CustomSelect from './CustomSelect.jsx';
import { formatAppDate } from './dateFormat.js';

async function requestJson(url, options = {}) {
  try {
    const method = String(options.method || 'GET').toUpperCase();
    const csrfToken = sessionStorage.getItem('mp_admin_csrf') || '';
    const headers = { ...(options.headers || {}) };
    if (method !== 'GET' && method !== 'HEAD') {
      headers['x-mp-request'] = '1';
      if (csrfToken) headers['x-mp-csrf'] = csrfToken;
    }
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, headers });
    const data = await response.json().catch(() => ({ ok: false, message: 'The server returned an invalid response.' }));
    if (data?.csrfToken) sessionStorage.setItem('mp_admin_csrf', data.csrfToken);
    if (response.status === 401) sessionStorage.removeItem('mp_admin_csrf');
    return response.ok ? data : { ...data, ok: false, httpStatus: response.status };
  } catch {
    return { ok: false, message: navigator.onLine === false ? 'No internet connection.' : 'Push notification Admin could not be reached.' };
  }
}

function toDraft(template = {}) {
  return {
    templateKey: template.template_key || '',
    displayName: template.display_name || '',
    description: template.description || '',
    title: template.title || '',
    body: template.body || '',
    targetUrl: template.target_url || '/vault',
    isEnabled: template.is_enabled !== false,
    updatedAt: template.updated_at || ''
  };
}

function sameEditableTemplate(a = {}, b = {}) {
  return String(a.title || '') === String(b.title || '')
    && String(a.body || '') === String(b.body || '')
    && String(a.targetUrl || '/vault') === String(b.targetUrl || '/vault')
    && Boolean(a.isEnabled) === Boolean(b.isEnabled);
}

const BROADCAST_TARGETS = [
  { value: '/vault', label: 'Vault home' },
  { value: '/vault?open=notifications', label: 'Push Notifications settings' },
  { value: '/vault?open=emergency', label: 'Trusted Person Access' }
];

export default function AdminPushNotifications({ onSessionExpired, setGlobalNotice }) {
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [data, setData] = useState({ templates: [], recentLogs: [], summary: {}, configuration: {} });
  const [drafts, setDrafts] = useState({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
  const [broadcast, setBroadcast] = useState({ title: '', body: '', targetUrl: '/vault' });
  const [notice, setNotice] = useState('');

  const sortedDrafts = useMemo(() => Object.values(drafts).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName))), [drafts]);
  const templateOptions = useMemo(() => sortedDrafts.map((draft) => ({ value: draft.templateKey, label: draft.displayName })), [sortedDrafts]);
  const selectedDraft = drafts[selectedTemplateKey] || sortedDrafts[0] || null;
  const selectedOriginal = selectedDraft ? toDraft((data.templates || []).find((template) => template.template_key === selectedDraft.templateKey) || {}) : null;
  const selectedHasChanges = Boolean(selectedDraft && selectedOriginal && !sameEditableTemplate(selectedDraft, selectedOriginal));

  useEffect(() => { load(); }, []);

  function applyData(result) {
    const templates = result.templates || [];
    const nextDrafts = Object.fromEntries(templates.map((template) => [template.template_key, toDraft(template)]));
    setData({ templates, recentLogs: result.recentLogs || [], summary: result.summary || {}, configuration: result.configuration || {} });
    setDrafts(nextDrafts);
    setSelectedTemplateKey((current) => current && nextDrafts[current] ? current : (templates[0]?.template_key || ''));
  }

  async function load() {
    setLoading(true);
    const result = await requestJson('/.netlify/functions/admin-push-notifications');
    setLoading(false);
    if (!result.ok) {
      if (result.httpStatus === 401) onSessionExpired?.(result.message);
      setNotice(result.message || 'Push notification Admin data could not be loaded.');
      return;
    }
    applyData(result);
    setNotice('');
  }

  function updateDraft(templateKey, patch) {
    setDrafts((current) => ({ ...current, [templateKey]: { ...current[templateKey], ...patch } }));
  }

  async function saveTemplate(templateKey) {
    const draft = drafts[templateKey];
    const original = toDraft((data.templates || []).find((template) => template.template_key === templateKey) || {});
    if (!draft || sameEditableTemplate(draft, original)) return;
    setBusyKey(templateKey);
    setNotice('Saving push notification text...');
    const result = await requestJson('/.netlify/functions/admin-push-notifications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'save_template', templateKey, title: draft.title, body: draft.body, targetUrl: draft.targetUrl, isEnabled: draft.isEnabled })
    });
    setBusyKey('');
    if (!result.ok) {
      if (result.httpStatus === 401) onSessionExpired?.(result.message);
      setNotice(result.message || 'Push notification text could not be saved.');
      setGlobalNotice?.(result.message || 'Push notification text could not be saved.');
      return;
    }
    applyData(result);
    setSelectedTemplateKey(templateKey);
    setNotice(result.message || 'Push notification text saved.');
    setGlobalNotice?.(result.message || 'Push notification text saved.');
  }

  async function sendBroadcast(event) {
    event.preventDefault();
    if (!broadcast.title.trim() || !broadcast.body.trim()) {
      setNotice('Enter a broadcast title and message first.');
      return;
    }
    if (!window.confirm('Send this push notification now to every registered device where a Password-Encrypt user has enabled push notifications?')) return;
    setBusyKey('broadcast');
    setNotice('Sending push notification to all enabled users...');
    const result = await requestJson('/.netlify/functions/admin-push-notifications', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'send_broadcast', title: broadcast.title, body: broadcast.body, targetUrl: broadcast.targetUrl })
    });
    setBusyKey('');
    if (!result.ok) {
      if (result.httpStatus === 401) onSessionExpired?.(result.message);
      setNotice(result.message || 'Push broadcast could not be sent.');
      setGlobalNotice?.(result.message || 'Push broadcast could not be sent.');
      return;
    }
    applyData(result);
    setNotice(result.message || 'Push broadcast finished.');
    setGlobalNotice?.(result.message || 'Push broadcast finished.');
    setBroadcast((current) => ({ ...current, title: '', body: '' }));
  }

  return (
    <section className="admin-content admin-push-content">
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div><p className="eyebrow">Push Notifications</p><h2>Delivery and message control</h2></div>
          <button type="button" className="secondary-button" onClick={load} disabled={loading || Boolean(busyKey)}><RefreshCw size={17} className={loading ? 'spin-icon' : ''} /> Refresh</button>
        </div>
        <p className="admin-panel-intro">Edit the owner-facing Trusted Person notification text and send one app-wide push message to every user who has enabled notifications.</p>

        {!data.configuration?.configured && !loading && <div className="admin-push-warning"><AlertTriangle size={19} /><span><strong>Push delivery is not configured yet</strong><small>Users will not be offered push notifications until the VAPID keys are added to the Password-Encrypt Netlify environment. Email notifications are unaffected.</small></span></div>}

        <div className="admin-stat-grid admin-push-stat-grid">
          <article><Bell /><strong>{data.summary?.activeSubscriptions || 0}</strong><span>Active devices</span></article>
          <article><ShieldCheck /><strong>{data.summary?.pushEnabledUsers || 0}</strong><span>Users enabled</span></article>
          <article><ShieldCheck /><strong>{data.summary?.pushEnabledAccounts || 0}</strong><span>Accounts reached</span></article>
          <article><AlertTriangle /><strong>{data.summary?.failedActiveSubscriptions || 0}</strong><span>Devices needing retry</span></article>
        </div>
      </section>

      <section className="admin-panel admin-push-broadcast-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Broadcast</p><h2>Send to all enabled users</h2></div><span>{data.summary?.activeSubscriptions || 0} registered device(s)</span></div>
        <p className="admin-panel-intro">This sends one notification immediately to every active push subscription. Users who have not enabled push notifications are not contacted.</p>
        <form className="admin-push-broadcast-form" onSubmit={sendBroadcast}>
          <label>Notification title<input maxLength="80" value={broadcast.title} onChange={(event) => setBroadcast({ ...broadcast, title: event.target.value })} placeholder="Password-Encrypt update" /></label>
          <label>Notification text<textarea rows="4" maxLength="220" value={broadcast.body} onChange={(event) => setBroadcast({ ...broadcast, body: event.target.value })} placeholder="Write the message users should see..." /></label>
          <label>Open when tapped<CustomSelect value={broadcast.targetUrl} ariaLabel="Choose where the push notification opens" options={BROADCAST_TARGETS} onChange={(targetUrl) => setBroadcast({ ...broadcast, targetUrl })} /></label>
          <div className="admin-push-broadcast-footer"><small>{broadcast.body.length}/220 characters</small><button type="submit" className="primary-button" disabled={busyKey === 'broadcast' || !data.configuration?.configured || !broadcast.title.trim() || !broadcast.body.trim()}><Send size={17} /> {busyKey === 'broadcast' ? 'Sending...' : 'Send push to all users'}</button></div>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Trusted Person flow</p><h2>Automatic notification text</h2></div><span>{sortedDrafts.length} notification types</span></div>
        <p className="admin-panel-intro">Choose the notification type you want to work on. Placeholders such as <code>{'{contactName}'}</code> and <code>{'{waitingPeriod}'}</code> are filled at send time.</p>
        {sortedDrafts.length > 0 && (
          <div className="admin-push-template-picker">
            <label>Notification type<CustomSelect value={selectedDraft?.templateKey || ''} ariaLabel="Choose push notification type" options={templateOptions} onChange={setSelectedTemplateKey} /></label>
          </div>
        )}
        <div className="admin-push-template-list admin-push-template-single">
          {selectedDraft && (
            <article className="admin-push-template-card" key={selectedDraft.templateKey}>
              <div className="admin-push-template-heading">
                <div><strong>{selectedDraft.displayName}</strong><span>{selectedDraft.description}</span></div>
                <label className="admin-push-enabled"><input type="checkbox" checked={selectedDraft.isEnabled} onChange={(event) => updateDraft(selectedDraft.templateKey, { isEnabled: event.target.checked })} /> Enabled</label>
              </div>
              <label>Notification title<input maxLength="80" value={selectedDraft.title} onChange={(event) => updateDraft(selectedDraft.templateKey, { title: event.target.value })} /></label>
              <label>Notification text<textarea rows="3" maxLength="220" value={selectedDraft.body} onChange={(event) => updateDraft(selectedDraft.templateKey, { body: event.target.value })} /></label>
              <div className="admin-push-template-footer"><small>{selectedDraft.body.length}/220 characters{selectedDraft.updatedAt ? ` · Updated ${formatAppDate(selectedDraft.updatedAt, true)}` : ''}</small><button type="button" className="primary-button" onClick={() => saveTemplate(selectedDraft.templateKey)} disabled={Boolean(busyKey) || !selectedHasChanges}><Save size={17} /> {busyKey === selectedDraft.templateKey ? 'Saving...' : 'Save'}</button></div>
            </article>
          )}
          {!sortedDrafts.length && !loading && <div className="admin-empty">No push notification templates were returned. Run the Ver-1.001 database migration.</div>}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-heading"><div><p className="eyebrow">Recent delivery</p><h2>Push notification history</h2></div><span>{data.recentLogs?.length || 0} recent entries</span></div>
        <div className="admin-push-log-list">
          {(data.recentLogs || []).map((entry) => <article key={entry.id}><Bell size={18} /><div><strong>{entry.title || entry.template_key || 'Push notification'}</strong><span>{entry.body_preview || 'No message preview'} </span><small>{formatAppDate(entry.created_at, true)} · {entry.delivered || 0} delivered · {entry.failed || 0} failed{entry.disabled_endpoints ? ` · ${entry.disabled_endpoints} expired endpoint(s) removed` : ''}</small></div></article>)}
          {!data.recentLogs?.length && !loading && <div className="admin-empty">No push notifications have been sent yet.</div>}
        </div>
      </section>

      {notice && <div className="admin-notice">{notice}</div>}
    </section>
  );
}
