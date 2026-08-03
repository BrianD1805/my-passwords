import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgePoundSterling, Ban, CalendarClock, ChevronDown, ChevronUp, Cloud, CreditCard, Eye, EyeOff, LogOut, Plus, Play, RefreshCw, Save, ShieldCheck, Trash2, UserRoundCheck, UsersRound, X } from 'lucide-react';

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({ ok: false, message: 'The server returned an invalid response.' }));
  if (!response.ok) return { ...data, ok: false, httpStatus: response.status };
  return data;
}

function emptyPlan() {
  return {
    code: '', displayName: '', description: '', currency: 'GBP', monthlyPrice: '0.00', quarterlyPrice: '0.00', annualPrice: '0.00',
    trialDays: 14, maxUsers: 1, storageLimitMb: 0, documentLimit: 0, features: '', isFeatured: false, isPublic: false, isActive: true, displayOrder: 10, stripeSyncStatus: 'not_synced', stripeSyncMessage: '', stripeSyncedAt: ''
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
    displayOrder: Number(plan.display_order || 0),
    stripeSyncStatus: plan.stripe_sync_status || 'not_synced',
    stripeSyncMessage: plan.stripe_sync_message || '',
    stripeSyncedAt: plan.stripe_synced_at || ''
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


function dateLabel(value, includeTime = false) {
  if (!value) return '—';
  const options = includeTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(value));
}

function trialDaysLeft(value) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
}

function isFounder(customer) {
  return ['founder_private', 'private_founder'].includes(String(customer?.planCode || '').toLowerCase())
    || String(customer?.planStatus || '').toLowerCase() === 'founder_active';
}

function planStatusDisplayName(planStatus) {
  const status = String(planStatus || '').trim().toLowerCase();
  if (status === 'founder_active') return 'Founder Active';
  if (status === 'trial_pending') return 'Trial Pending';
  if (status === 'signup_pending') return 'Signup Pending';
  if (status === 'trial_active' || status === 'trialing') return 'Trial Active';
  if (status === 'active') return 'Active';
  if (status === 'trial_expired') return 'Trial Expired';
  if (status === 'trial_cancelled') return 'Trial Cancelled';
  return status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Active';
}

export default function AdminApp({ version }) {
  const [auth, setAuth] = useState({ checking: true, authenticated: false, message: '' });
  const [accessKey, setAccessKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({ plans: [], customers: [], billingEvents: [], summary: {}, stripeConfigured: false });
  const [activeTab, setActiveTab] = useState('overview');
  const [editor, setEditor] = useState(emptyPlan());
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [planEditorMode, setPlanEditorMode] = useState('new');
  const [expandedCustomerId, setExpandedCustomerId] = useState('');
  const [planVisibility, setPlanVisibility] = useState('active');
  const [notice, setNotice] = useState('');
  const [trialDays, setTrialDays] = useState({});

  const sortedPlans = useMemo(() => [...(data.plans || [])]
    .filter((plan) => String(plan?.code || '').trim() && String(plan?.display_name || '').trim())
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)), [data.plans]);
  const activePublishedPlans = useMemo(() => sortedPlans.filter((plan) => plan.is_active && plan.is_public), [sortedPlans]);
  const hiddenPlans = useMemo(() => sortedPlans.filter((plan) => !(plan.is_active && plan.is_public)), [sortedPlans]);
  const visiblePlans = planVisibility === 'active' ? activePublishedPlans : hiddenPlans;

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!planEditorOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busy) setPlanEditorOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [planEditorOpen, busy]);

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
    setData({ plans: [], customers: [], billingEvents: [], summary: {}, stripeConfigured: false });
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
    setData({ plans: result.plans || [], customers: result.customers || [], billingEvents: result.billingEvents || [], summary: result.summary || {}, stripeConfigured: Boolean(result.stripeConfigured) });
    setNotice('');
  }

  function editPlan(plan) {
    setEditor(toEditorPlan(plan));
    setPlanEditorMode('edit');
    setPlanEditorOpen(true);
  }

  function addPlan() {
    setEditor(emptyPlan());
    setPlanEditorMode('new');
    setPlanEditorOpen(true);
  }

  function closePlanEditor() {
    if (busy) return;
    setPlanEditorOpen(false);
  }

  function toggleCustomer(customerId) {
    setExpandedCustomerId((current) => current === customerId ? '' : customerId);
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
    setNotice(result.message || 'Subscription plan saved.');
    setEditor(result.plan ? toEditorPlan(result.plan) : emptyPlan());
    setPlanEditorOpen(false);
    await loadData();
  }

  async function syncPlanToStripe(planCode = editor.code) {
    if (!planCode) return;
    setBusy(true);
    setNotice('Syncing plan to Stripe Billing...');
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sync_stripe_plan', planCode })
    });
    setBusy(false);
    setNotice(result.message || (result.ok ? 'Stripe Billing sync complete.' : 'Stripe Billing sync failed.'));
    if (result.plan) setEditor(toEditorPlan(result.plan));
    await loadData();
  }

  async function deletePlan() {
    if (!editor.code) return;
    const confirmed = window.confirm(`Delete the ${editor.displayName || editor.code} plan? This is only allowed when no customer account or subscription uses it.`);
    if (!confirmed) return;
    setBusy(true);
    setNotice('Deleting subscription plan...');
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete_plan', planCode: editor.code })
    });
    setBusy(false);
    setNotice(result.message || (result.ok ? 'Subscription plan deleted.' : 'Plan could not be deleted.'));
    if (result.ok) {
      setPlanEditorOpen(false);
      setEditor(emptyPlan());
      await loadData();
    }
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

  async function manageTrial(customer, action, extra = {}) {
    setBusy(true);
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, tenantId: customer.id, ...extra })
    });
    setBusy(false);
    setNotice(result.message || (result.ok ? 'Trial updated.' : 'Trial update failed.'));
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
        <button type="button" className={activeTab === 'billing' ? 'active' : ''} onClick={() => setActiveTab('billing')}>Billing Events</button>
        <button type="button" className={activeTab === 'sync' ? 'active' : ''} onClick={() => setActiveTab('sync')}>Sync Health</button>
      </nav>

      {notice && <div className="admin-notice">{notice}</div>}

      {activeTab === 'overview' && (
        <section className="admin-content">
          <div className="admin-stat-grid">
            <article><UsersRound /><strong>{data.summary?.tenants || 0}</strong><span>Total accounts</span></article>
            <article><UserRoundCheck /><strong>{data.summary?.activeAccounts || 0}</strong><span>Active accounts</span></article>
            <article><ShieldCheck /><strong>{data.summary?.trials || 0}</strong><span>Active trials</span></article><article><CalendarClock /><strong>{data.summary?.pendingSignups || 0}</strong><span>Pending signups</span></article><article><AlertTriangle /><strong>{data.summary?.expiredTrials || 0}</strong><span>Expired trials</span></article>
            <article><BadgePoundSterling /><strong>{data.summary?.publishedPlans || 0}</strong><span>Published plans</span></article>
            <article><CreditCard /><strong>{data.summary?.paidSubscriptions || 0}</strong><span>Paid subscriptions</span></article>
            <article><AlertTriangle /><strong>{data.summary?.paymentProblems || 0}</strong><span>Payment problems</span></article>
            <article><AlertTriangle /><strong>{data.summary?.syncIssues || 0}</strong><span>Sync issues</span></article>
          </div>
        </section>
      )}

      {activeTab === 'plans' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading admin-plan-directory-heading">
              <div><p className="eyebrow">Subscription Plans</p><h2>Sellable plans</h2></div>
              <div className="admin-plan-directory-actions">
                <div className="admin-plan-filter" role="group" aria-label="Filter subscription plans">
                  <button type="button" className={planVisibility === 'active' ? 'active' : ''} onClick={() => setPlanVisibility('active')}>Active <span>{activePublishedPlans.length}</span></button>
                  <button type="button" className={planVisibility === 'hidden' ? 'active' : ''} onClick={() => setPlanVisibility('hidden')}>Hidden <span>{hiddenPlans.length}</span></button>
                </div>
                <button type="button" className="primary-button" onClick={addPlan}><Plus size={18} /> Add plan</button>
              </div>
            </div>
            <div className="admin-plan-list admin-plan-directory">
              {visiblePlans.map((plan) => (
                <button type="button" className="admin-plan-card" key={plan.id || plan.code} onClick={() => editPlan(plan)} aria-label={`Open ${plan.display_name} plan`}>
                  <div><strong>{plan.display_name}</strong><code>{plan.code}</code></div>
                  <p>{plan.description}</p>
                  <div className="admin-plan-prices"><span><small>Monthly</small>{money(plan.monthly_price_minor)}</span><span><small>Quarterly</small>{money(plan.quarterly_price_minor)}</span><span><small>Annual</small>{money(plan.annual_price_minor)}</span></div>
                  <footer><span>{plan.trial_days || 0} trial days</span><span>{plan.is_public ? 'Published' : 'Hidden'}</span><span>{plan.is_active ? 'Active' : 'Inactive'}</span><span className={`stripe-plan-state ${plan.stripe_sync_status || 'not_synced'}`}>Stripe: {(plan.stripe_sync_status || 'not synced').replace(/_/g, ' ')}</span></footer>
                </button>
              ))}
              {!visiblePlans.length && <div className="admin-empty">{planVisibility === 'active' ? 'No active published plans are available.' : 'No hidden, unpublished or inactive plans are available.'}</div>}
            </div>
          </section>
        </section>
      )}

      {activeTab === 'customers' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Accounts</p><h2>Customers</h2></div><span>{data.customers?.length || 0} accounts</span></div>
            <div className="admin-customer-list admin-customer-accordion-list">
              {(data.customers || []).map((customer) => {
                const founder = isFounder(customer);
                const daysLeft = trialDaysLeft(customer.trialEndsAt);
                const extensionDays = Number(trialDays[customer.id] || 7);
                const stripeManaged = customer.subscription?.provider === 'stripe' && Boolean(customer.subscription?.provider_subscription_id);
                const expanded = expandedCustomerId === customer.id;
                const onboardingLabel = founder ? 'Founder account' : customer.onboardingCompletedAt ? `Completed ${dateLabel(customer.onboardingCompletedAt)}` : 'Pending verification';
                return (
                  <article key={customer.id} className={`admin-customer-accordion ${expanded ? 'open' : ''}`}>
                    <button type="button" className="admin-customer-summary" onClick={() => toggleCustomer(customer.id)} aria-expanded={expanded}>
                      <span className="admin-customer-main">
                        <strong>{customer.accountName}</strong>
                        <span>{planDisplayName(customer.planCode)} · {planStatusDisplayName(customer.planStatus)}</span>
                        <small>{customer.users?.[0]?.displayName || 'Owner'} · {customer.users?.[0]?.email || customer.users?.[0]?.emailMasked || 'No email'} · {customer.users?.[0]?.phone || customer.users?.[0]?.phoneMasked || 'No phone'}</small>
                      </span>
                      <span className="admin-customer-meta">
                        <span className={`admin-status ${customer.accountStatus}`}>{customer.accountStatus}</span>
                        <small>Created {dateLabel(customer.createdAt)}</small>
                      </span>
                      <span className="admin-accordion-chevron">{expanded ? <ChevronUp size={21} /> : <ChevronDown size={21} />}</span>
                    </button>
                    {expanded && (
                      <div className="admin-customer-details">
                        <div className="admin-trial-summary">
                          <span><strong>Trial started</strong>{dateLabel(customer.trialStartedAt, true)}</span>
                          <span><strong>Trial ends</strong>{founder ? 'No expiry' : dateLabel(customer.trialEndsAt, true)}</span>
                          <span><strong>Time remaining</strong>{founder ? 'Founder access' : daysLeft === null ? 'No active trial' : `${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</span>
                          <span><strong>Onboarding</strong>{onboardingLabel}</span>
                        </div>
                        {!founder && customer.subscription?.provider === 'stripe' && (
                          <div className="admin-billing-summary admin-billing-summary-wide">
                            <div className="admin-billing-summary-heading"><CreditCard size={20} /><span><strong>Stripe subscription</strong><small>{String(customer.subscription.status || 'pending').replace(/_/g, ' ')} · {customer.subscription.billing_interval || 'interval pending'} · {money(customer.subscription.price_minor || 0)}{customer.subscription.current_period_end ? ` · renews/ends ${dateLabel(customer.subscription.current_period_end)}` : ''}</small></span></div>
                            <div className="admin-stripe-reference-grid">
                              <span><small>Stripe customer reference</small><code>{customer.subscription.provider_customer_id || 'Pending'}</code></span>
                              <span><small>Stripe subscription reference</small><code>{customer.subscription.provider_subscription_id || 'Pending'}</code></span>
                            </div>
                          </div>
                        )}
                        {!founder && !stripeManaged && (
                          <div className="admin-trial-controls">
                            <label>Days<input type="number" min="1" max="365" value={extensionDays} onChange={(event) => setTrialDays((current) => ({ ...current, [customer.id]: event.target.value }))} /></label>
                            <button type="button" className="secondary-button" onClick={() => manageTrial(customer, 'start_trial', { days: extensionDays })} disabled={busy}><Play size={16} /> Start trial</button>
                            <button type="button" className="secondary-button" onClick={() => manageTrial(customer, 'extend_trial', { days: extensionDays })} disabled={busy}><CalendarClock size={16} /> Extend</button>
                            <button type="button" className="secondary-button" onClick={() => manageTrial(customer, 'activate_account')} disabled={busy}><UserRoundCheck size={16} /> Activate</button>
                            <button type="button" className="secondary-button danger-soft" onClick={() => manageTrial(customer, 'cancel_trial')} disabled={busy}><Ban size={16} /> Cancel trial</button>
                            {customer.accountStatus === 'suspended'
                              ? <button type="button" className="secondary-button" onClick={() => setAccountStatus(customer, 'active')} disabled={busy}>Remove suspension</button>
                              : <button type="button" className="secondary-button danger-soft" onClick={() => setAccountStatus(customer, 'suspended')} disabled={busy}>Suspend</button>}
                          </div>
                        )}
                        {!founder && stripeManaged && (
                          <div className="admin-stripe-account-actions">
                            {customer.accountStatus === 'suspended'
                              ? <button type="button" className="secondary-button" onClick={() => setAccountStatus(customer, 'active')} disabled={busy}>Remove suspension</button>
                              : <button type="button" className="secondary-button danger-soft" onClick={() => setAccountStatus(customer, 'suspended')} disabled={busy}>Suspend</button>}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
              {!data.customers?.length && <div className="admin-empty">No customer accounts were returned.</div>}
            </div>
          </section>
        </section>
      )}


      {activeTab === 'billing' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Stripe Billing</p><h2>Billing events</h2></div><span>{data.billingEvents?.length || 0} recent events</span></div>
            <p className="admin-panel-intro">Verified Stripe webhooks update subscriptions, renewals, failed payments and cancellations. No card details are stored in My Passwords.</p>
            <div className="admin-billing-event-list">
              {(data.billingEvents || []).map((event) => <article className={`admin-billing-event ${event.status || 'recorded'}`} key={event.id}><div className="admin-sync-icon"><CreditCard size={20} /></div><div><strong>{String(event.event_type || 'billing event').replace(/_/g, ' ')}</strong><span>{event.tenant_id || 'Unmatched account'}{event.amount_minor ? ` · ${money(event.amount_minor)}` : ''}</span><small>{dateLabel(event.occurred_at || event.created_at, true)} · {event.provider || 'internal'} · {event.status || 'recorded'}</small></div></article>)}
              {!data.billingEvents?.length && <div className="admin-empty">No billing events have been recorded yet.</div>}
            </div>
          </section>
        </section>
      )}

      {activeTab === 'sync' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Vault operations</p><h2>Sync health</h2></div><span>Encrypted metadata only</span></div>
            <p className="admin-panel-intro">Admin can see backup dates, item counts and operational errors. Vault contents and master passwords remain unreadable.</p>
            <div className="admin-sync-list">
              {(data.customers || []).map((customer) => {
                const diagnostic = customer.syncDiagnostics || {};
                const snapshot = diagnostic.latestSnapshot || null;
                const event = diagnostic.latestEvent || null;
                const eventStatus = String(event?.status || (snapshot ? 'success' : 'warning')).toLowerCase();
                return (
                  <article className={`admin-sync-card ${eventStatus}`} key={`sync-${customer.id}`}>
                    <div className="admin-sync-icon">{eventStatus === 'success' ? <Cloud size={21} /> : <AlertTriangle size={21} />}</div>
                    <div className="admin-sync-main">
                      <strong>{customer.accountName}</strong>
                      <span>{event?.message || (snapshot ? 'Latest encrypted backup is available.' : 'No encrypted backup has been recorded yet.')}</span>
                      <small>{snapshot ? `Last backup ${new Date(snapshot.created_at).toLocaleString()} · ${snapshot.item_count || 0} item(s)` : 'No backup date'}{event?.created_at ? ` · Last event ${new Date(event.created_at).toLocaleString()}` : ''}</small>
                    </div>
                    <div className="admin-sync-meta"><span className={`admin-status ${eventStatus}`}>{eventStatus}</span><small>{diagnostic.eventCount || 0} event(s)</small></div>
                  </article>
                );
              })}
              {!data.customers?.length && <div className="admin-empty">No customer sync diagnostics were returned.</div>}
            </div>
          </section>
        </section>
      )}

      {planEditorOpen && (
        <div className="admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePlanEditor(); }}>
          <section className="admin-plan-window" role="dialog" aria-modal="true" aria-labelledby="admin-plan-window-title">
            <header className="admin-plan-window-header">
              <div><p className="eyebrow">Subscription Plan</p><h2 id="admin-plan-window-title">{planEditorMode === 'edit' ? `Edit ${editor.displayName || editor.code}` : 'Add new plan'}</h2></div>
              <button type="button" className="admin-window-close" onClick={closePlanEditor} aria-label="Close plan window"><X size={22} /></button>
            </header>
            <form className="admin-plan-window-form" onSubmit={savePlan}>
              <div className="admin-plan-window-body">
                <div className="admin-form-grid">
                  <label>Plan code<input value={editor.code} onChange={(e) => setEditor({ ...editor, code: e.target.value })} placeholder="personal" required disabled={planEditorMode === 'edit'} /></label>
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
                <div className={`admin-stripe-status ${editor.stripeSyncStatus || 'not_synced'}`}><CreditCard size={18} /><span><strong>Stripe Billing: {data.stripeConfigured ? (editor.stripeSyncStatus || 'Not synced').replace(/_/g, ' ') : 'Not configured'}</strong><small>{editor.stripeSyncMessage || (data.stripeConfigured ? 'Save the plan to create or update its Stripe Product and recurring Prices.' : 'Add STRIPE_SECRET_KEY to the existing My Passwords Netlify site.')}</small></span></div>
              </div>
              <footer className="admin-plan-window-footer">
                <div>{planEditorMode === 'edit' && <button type="button" className="secondary-button danger-soft" onClick={deletePlan} disabled={busy}><Trash2 size={17} /> Delete plan</button>}</div>
                <div className="admin-plan-window-actions">
                  <button type="button" className="secondary-button" onClick={closePlanEditor} disabled={busy}>Cancel</button>
                  {planEditorMode === 'edit' && <button type="button" className="secondary-button" onClick={() => syncPlanToStripe(editor.code)} disabled={busy}><RefreshCw size={17} /> Sync Stripe</button>}
                  <button type="submit" className="primary-button" disabled={busy}><Save size={18} /> {busy ? 'Saving...' : 'Save and sync plan'}</button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      <footer className="admin-footer">{version} · one-site admin foundation</footer>
    </main>
  );
}
