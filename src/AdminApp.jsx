import React, { useEffect, useMemo, useState } from 'react';
import { BadgePoundSterling, Check, Eye, EyeOff, LogOut, RefreshCw, Save, ShieldCheck, UserRoundCheck, UsersRound } from 'lucide-react';

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({ ok: false, message: 'The server returned an invalid response.' }));
  if (!response.ok) return { ...data, ok: false, httpStatus: response.status };
  return data;
}

function emptyPlan() {
  return {
    code: '', displayName: '', description: '', currency: 'GBP', monthlyPrice: '0.00', quarterlyPrice: '0.00', annualPrice: '0.00',
    trialDays: 14, maxUsers: 1, storageLimitMb: 0, documentLimit: 0, features: '', isFeatured: false, isPublic: false, isActive: true, displayOrder: 10
  };
}

function toEditorPlan(plan) {
  return {
    code: plan.code || '',
    displayName: plan.display_name || '',
    description: plan.description || '',
    currency: 'GBP',
    monthlyPrice: (Number(plan.monthly_price_minor || 0) / 100).toFixed(2),
    quarterlyPrice: (Number(plan.quarterly_price_minor || 0) / 100).toFixed(2),
    annualPrice: (Number(plan.annual_price_minor || 0) / 100).toFixed(2),
    trialDays: Number(plan.trial_days || 0),
    maxUsers: Number(plan.max_users || 1),
    storageLimitMb: Number(plan.storage_limit_mb || 0),
    documentLimit: Number(plan.document_limit || 0),
    features: Array.isArray(plan.features) ? plan.features.join('\n') : '',
    isFeatured: Boolean(plan.is_featured),
    isPublic: Boolean(plan.is_public),
    isActive: plan.is_active !== false,
    displayOrder: Number(plan.display_order || 0)
  };
}

function minor(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function money(minorValue) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(minorValue || 0) / 100);
}

function planDisplayName(planCode) {
  const code = String(planCode || '').trim().toLowerCase();
  if (code === 'founder_private' || code === 'private_founder') return 'Founder Plan';
  if (code === 'personal_free' || code === 'personal') return 'Personal';
  if (code === 'family') return 'Family';
  if (code === 'business') return 'Business';
  return code ? code.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Personal';
}

function planStatusDisplayName(planStatus) {
  const status = String(planStatus || '').trim().toLowerCase();
  if (status === 'founder_active') return 'Founder Active';
  if (status === 'trial_pending') return 'Trial Pending';
  if (status === 'signup_pending') return 'Signup Pending';
  if (status === 'trial_active' || status === 'trialing') return 'Trial Active';
  if (status === 'active') return 'Active';
  return status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Active';
}

export default function AdminApp({ version }) {
  const [auth, setAuth] = useState({ checking: true, authenticated: false, message: '' });
  const [accessKey, setAccessKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({ plans: [], customers: [], summary: {} });
  const [activeTab, setActiveTab] = useState('overview');
  const [editor, setEditor] = useState(emptyPlan());
  const [notice, setNotice] = useState('');

  const sortedPlans = useMemo(() => [...(data.plans || [])].sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)), [data.plans]);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const result = await requestJson('/.netlify/functions/admin-auth');
    const authenticated = Boolean(result.authenticated);
    setAuth({ checking: false, authenticated, message: result.message || '' });
    if (authenticated) await loadData();
  }

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const result = await requestJson('/.netlify/functions/admin-auth', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'login', accessKey })
    });
    setBusy(false);
    if (!result.ok || !result.authenticated) {
      setNotice(result.message || 'Admin sign-in failed.');
      return;
    }
    setAccessKey('');
    setAuth({ checking: false, authenticated: true, message: result.message || 'Admin access confirmed.' });
    await loadData();
  }

  async function logout() {
    await requestJson('/.netlify/functions/admin-auth', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' })
    });
    setAuth({ checking: false, authenticated: false, message: 'Admin session ended.' });
    setData({ plans: [], customers: [], summary: {} });
  }

  async function loadData() {
    setBusy(true);
    const result = await requestJson('/.netlify/functions/admin-data');
    setBusy(false);
    if (!result.ok) {
      if (result.httpStatus === 401) setAuth({ checking: false, authenticated: false, message: result.message || 'Admin sign-in is required.' });
      setNotice(result.message || 'Could not load admin data.');
      return;
    }
    setData({ plans: result.plans || [], customers: result.customers || [], summary: result.summary || {} });
    setNotice('');
  }

  function editPlan(plan) {
    setEditor(toEditorPlan(plan));
    setActiveTab('plans');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function savePlan(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('Saving subscription plan...');
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        action: 'save_plan',
        plan: {
          code: editor.code,
          displayName: editor.displayName,
          description: editor.description,
          currency: 'GBP',
          monthlyPriceMinor: minor(editor.monthlyPrice),
          quarterlyPriceMinor: minor(editor.quarterlyPrice),
          annualPriceMinor: minor(editor.annualPrice),
          trialDays: Number(editor.trialDays || 0),
          maxUsers: Number(editor.maxUsers || 1),
          storageLimitMb: Number(editor.storageLimitMb || 0),
          documentLimit: Number(editor.documentLimit || 0),
          features: editor.features,
          isFeatured: editor.isFeatured,
          isPublic: editor.isPublic,
          isActive: editor.isActive,
          displayOrder: Number(editor.displayOrder || 0)
        }
      })
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message || 'Plan could not be saved.');
      return;
    }
    setNotice('Subscription plan saved.');
    setEditor(emptyPlan());
    await loadData();
  }

  async function setAccountStatus(customer, nextStatus) {
    setBusy(true);
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'set_account_status', tenantId: customer.id, accountStatus: nextStatus })
    });
    setBusy(false);
    setNotice(result.message || (result.ok ? 'Account updated.' : 'Account update failed.'));
    if (result.ok) await loadData();
  }

  if (auth.checking) {
    return <main className="admin-shell admin-centred"><section className="admin-login-card"><RefreshCw className="spin-icon" /><h1>Checking admin access</h1><p>{version}</p></section></main>;
  }

  if (!auth.authenticated) {
    return (
      <main className="admin-shell admin-centred">
        <section className="admin-login-card">
          <div className="admin-mark"><ShieldCheck size={28} /></div>
          <p className="eyebrow">My Passwords Admin</p>
          <h1>Owner administration</h1>
          <p>Manage SaaS plans and customer account status inside the same My Passwords Netlify site.</p>
          <form onSubmit={login}>
            <label>Admin access key
              <div className="admin-secret-field"><input type={showKey ? 'text' : 'password'} value={accessKey} onChange={(event) => setAccessKey(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowKey((current) => !current)} aria-label={showKey ? 'Hide admin key' : 'Show admin key'}>{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </label>
            <button className="primary-button" type="submit" disabled={busy}><ShieldCheck size={18} /> {busy ? 'Signing in...' : 'Open Admin'}</button>
          </form>
          {notice && <div className="admin-notice error">{notice}</div>}
          <a className="admin-back-link" href="/">Return to My Passwords</a>
          <small>{version}</small>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><p className="eyebrow">My Passwords</p><h1>Admin</h1><span>Single-site SaaS administration</span></div>
        <div className="admin-header-actions"><button type="button" className="secondary-button" onClick={loadData} disabled={busy}><RefreshCw size={17} className={busy ? 'spin-icon' : ''} /> Refresh</button><button type="button" className="secondary-button" onClick={logout}><LogOut size={17} /> Logout</button></div>
      </header>

      <nav className="admin-tabs">
        <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button type="button" className={activeTab === 'plans' ? 'active' : ''} onClick={() => setActiveTab('plans')}>Subscription Plans</button>
        <button type="button" className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>Customers</button>
      </nav>

      {notice && <div className="admin-notice">{notice}</div>}

      {activeTab === 'overview' && (
        <section className="admin-content">
          <div className="admin-stat-grid">
            <article><UsersRound /><strong>{data.summary?.tenants || 0}</strong><span>Total accounts</span></article>
            <article><UserRoundCheck /><strong>{data.summary?.activeAccounts || 0}</strong><span>Active accounts</span></article>
            <article><ShieldCheck /><strong>{data.summary?.trials || 0}</strong><span>Trials</span></article>
            <article><BadgePoundSterling /><strong>{data.summary?.publishedPlans || 0}</strong><span>Published plans</span></article>
          </div>
          <section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Foundation status</p><h2>SaaS controls</h2></div></div><div className="admin-check-grid"><span><Check size={17} /> Secure customer sessions</span><span><Check size={17} /> Server-derived tenant identity</span><span><Check size={17} /> Protected cloud vault and documents</span><span><Check size={17} /> Editable plan catalogue</span><span><Check size={17} /> Customer suspension controls</span><span><Check size={17} /> One Netlify site</span></div></section>
        </section>
      )}

      {activeTab === 'plans' && (
        <section className="admin-content admin-two-column">
          <form className="admin-panel admin-plan-form" onSubmit={savePlan}>
            <div className="admin-panel-heading"><div><p className="eyebrow">Plan Manager</p><h2>{editor.code ? `Edit ${editor.displayName || editor.code}` : 'Add subscription plan'}</h2></div>{editor.code && <button type="button" className="secondary-button" onClick={() => setEditor(emptyPlan())}>New plan</button>}</div>
            <div className="admin-form-grid">
              <label>Plan code<input value={editor.code} onChange={(e) => setEditor({ ...editor, code: e.target.value })} placeholder="personal" required /></label>
              <label>Display name<input value={editor.displayName} onChange={(e) => setEditor({ ...editor, displayName: e.target.value })} placeholder="Personal" required /></label>
              <label className="admin-full">Description<textarea value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></label>
              <label>Currency<input value="GBP (£)" disabled aria-label="Global currency GBP" /></label>
              <label>Trial days<input type="number" min="0" value={editor.trialDays} onChange={(e) => setEditor({ ...editor, trialDays: e.target.value })} /></label>
              <label>Monthly price<input type="number" min="0" step="0.01" value={editor.monthlyPrice} onChange={(e) => setEditor({ ...editor, monthlyPrice: e.target.value })} /></label>
              <label>Quarterly price<input type="number" min="0" step="0.01" value={editor.quarterlyPrice} onChange={(e) => setEditor({ ...editor, quarterlyPrice: e.target.value })} /></label>
              <label>Annual price<input type="number" min="0" step="0.01" value={editor.annualPrice} onChange={(e) => setEditor({ ...editor, annualPrice: e.target.value })} /></label>
              <label>Maximum users<input type="number" min="1" value={editor.maxUsers} onChange={(e) => setEditor({ ...editor, maxUsers: e.target.value })} /></label>
              <label>Storage limit MB<input type="number" min="0" value={editor.storageLimitMb} onChange={(e) => setEditor({ ...editor, storageLimitMb: e.target.value })} /></label>
              <label>Document limit<input type="number" min="0" value={editor.documentLimit} onChange={(e) => setEditor({ ...editor, documentLimit: e.target.value })} /></label>
              <label>Display order<input type="number" min="0" value={editor.displayOrder} onChange={(e) => setEditor({ ...editor, displayOrder: e.target.value })} /></label>
              <label className="admin-full">Features, one per line<textarea rows="6" value={editor.features} onChange={(e) => setEditor({ ...editor, features: e.target.value })} /></label>
            </div>
            <div className="admin-toggle-grid"><label><input type="checkbox" checked={editor.isActive} onChange={(e) => setEditor({ ...editor, isActive: e.target.checked })} /> Active</label><label><input type="checkbox" checked={editor.isPublic} onChange={(e) => setEditor({ ...editor, isPublic: e.target.checked })} /> Publish on website</label><label><input type="checkbox" checked={editor.isFeatured} onChange={(e) => setEditor({ ...editor, isFeatured: e.target.checked })} /> Featured plan</label></div>
            <button type="submit" className="primary-button" disabled={busy}><Save size={18} /> {busy ? 'Saving...' : 'Save plan'}</button>
          </form>

          <div className="admin-plan-list">
            {sortedPlans.map((plan) => <button type="button" className="admin-plan-card" key={plan.id || plan.code} onClick={() => editPlan(plan)}><div><strong>{plan.display_name}</strong><code>{plan.code}</code></div><p>{plan.description}</p><div className="admin-plan-prices"><span><small>Monthly</small>{money(plan.monthly_price_minor)}</span><span><small>Quarterly</small>{money(plan.quarterly_price_minor)}</span><span><small>Annual</small>{money(plan.annual_price_minor)}</span></div><footer><span>{plan.trial_days || 0} trial days</span><span>{plan.is_public ? 'Published' : 'Hidden'}</span><span>{plan.is_active ? 'Active' : 'Inactive'}</span></footer></button>)}
            {!sortedPlans.length && <div className="admin-empty">Run the Ver-0.039 Supabase SQL to create and seed the subscription plans.</div>}
          </div>
        </section>
      )}

      {activeTab === 'customers' && (
        <section className="admin-content"><section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Accounts</p><h2>Customer overview</h2></div><span>{data.customers?.length || 0} accounts</span></div><div className="admin-customer-list">{(data.customers || []).map((customer) => <article key={customer.id} className="admin-customer-card"><div className="admin-customer-main"><strong>{customer.accountName}</strong><span>{planDisplayName(customer.planCode)} · {planStatusDisplayName(customer.planStatus)}</span><small>{customer.users?.[0]?.displayName || 'Owner'} · {customer.users?.[0]?.emailMasked || 'No email'} · {customer.users?.[0]?.phoneMasked || 'No phone'}</small></div><div className="admin-customer-meta"><span className={`admin-status ${customer.accountStatus}`}>{customer.accountStatus}</span><small>Created {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : '—'}</small></div><div className="admin-customer-actions">{customer.accountStatus === 'suspended' ? <button type="button" className="secondary-button" onClick={() => setAccountStatus(customer, 'active')} disabled={busy}>Activate</button> : <button type="button" className="secondary-button danger-soft" onClick={() => setAccountStatus(customer, 'suspended')} disabled={busy}>Suspend</button>}</div></article>)}{!data.customers?.length && <div className="admin-empty">No customer accounts were returned.</div>}</div></section></section>
      )}

      <footer className="admin-footer">{version} · one-site admin foundation</footer>
    </main>
  );
}
